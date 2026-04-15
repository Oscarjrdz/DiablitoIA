import { redis } from './redis';

// Obtenemos el API KEY desde nuestras variables de entorno (o desde Redis si prefieres)
const configStr = await redis.get("wapp_config");
  const wappConfig = typeof configStr === "string" ? JSON.parse(configStr) : (configStr || {});
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || wappConfig.aiToken || "";


export async function processGeminiChat(phone, userMessage, loyverseToken) {
  // 1. Cargar historial de conversacion de Redis (o crear nuevo)
  let history = await redis.get(`chat_hist_${phone}`);
  if (!history) history = [];

  // 2. Verificar si el cliente existe en Loyverse
  let isRegistered = false;
  let customerData = null;
  
  try {
     const resCust = await fetch('https://api.loyverse.com/v1.0/customers?limit=250', {
        headers: { Authorization: `Bearer ${loyverseToken}` }
     });
     if (resCust.ok) {
         const data = await resCust.json();
         const cleanPhone = phone.replace(/\D/g, '');
         const last10 = cleanPhone.slice(-10);
         customerData = (data.customers || []).find(c => {
            if (!c.phone_number) return false;
            const cand = c.phone_number.replace(/\D/g, '');
            return cand.endsWith(last10) || cand.endsWith(cleanPhone);
         });
         if (customerData) isRegistered = true;
     }
  } catch (e) {
     console.error("Error verificando registro:", e);
  }

  // 3. Crear el Prompt de Sistema dinámico aislado por estado
  let systemPrompt = `Eres el Asistente de Atención al Cliente de "El Diablito Boneless & Burgers".
REGLAS GENERALES:
- Eres amable, usas emojis 🍔🌶️ y respondes corto y ágil.
- No hablas de temas que no tengan que ver con tus funciones asignadas.
`;

  if (!isRegistered) {
      systemPrompt += `
INSTRUCCIONES OBLIGATORIAS:
El cliente NO está registrado. Explícale que para darle beneficios necesitas registrarlo.
Pídele su Nombre Completo y Dirección.
Cuando tengas ambos datos, DEBES usar la herramienta 'registrar_cliente'.`;
  } else {
      systemPrompt += `
INSTRUCCIONES OBLIGATORIAS:
El cliente YA está registrado. Su nombre es ${customerData?.name || 'Cliente'}.
NO le preguntes datos de registro, no insistas en registrarlo.
Directamente saludalo por su nombre y envíale este Menú obligatorio:
"¿En qué te puedo ayudar hoy?
 1- Revisar tus puntos acumulados
 2- Editar tus datos"
Quédate a la espera.
Si dice "1", usa la herramienta 'ver_puntos'.
Si dice "2", usa la herramienta 'editar_datos'.`;
  }

  // 4. Ajustar el payload de Gemini con herramientas (Functions)
  history.push({ role: 'user', parts: [{ text: userMessage }] });

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    tools: [{
       function_declarations: [
          {
             name: "registrar_cliente",
             description: "Ejecuta el registro final del cliente en el POS una vez que te dio TODOS sus datos completos.",
             parameters: {
                type: "OBJECT",
                properties: {
                   nombre: { type: "STRING", description: "Nombre completo del cliente" },
                   
                   direccion: { type: "STRING", description: "Dirección completa proporcionada por el cliente" }
                },
                required: ["nombre", "direccion"]
             }
          },
          {
             name: "ver_puntos",
             description: "Consulta los puntos acumulados que tiene el cliente en Loyverse.",
             parameters: { type: "OBJECT", properties: {} }
          },
          {
             name: "editar_datos",
             description: "Actualiza un dato específico del cliente en la base de datos.",
             parameters: {
                 type: "OBJECT",
                 properties: {
                     campo: { type: "STRING", description: "Qué campo cambiar (ej. 'nombre' o 'direccion')" },
                     nuevo_valor: { type: "STRING", description: "El nuevo valor asigado por el cliente" }
                 },
                 required: ["campo", "nuevo_valor"]
             }
          }
       ]
    }]
  };

  // 5. Enviar a Gemini API
  if (!GEMINI_API_KEY) {
      return "⚠️ El administrador no ha configurado la API KEY de Gemini.";
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
  });

  const aiData = await res.json();
  const candidate = aiData?.candidates?.[0]?.content;
  if (!candidate) return "Ocurrió un error leyendo al modelo inteligente.";

  // Buscar si la IA decidió mandar a llamar a una de nuestras funciones
  const toolCall = candidate.parts.find(p => p.functionCall);
  let replyText = candidate.parts.find(p => p.text)?.text || "";

  // 6. Si detectamos Función / Herramienta, la ejecutamos
  if (toolCall) {
     const functionName = toolCall.functionCall.name;
     const args = toolCall.functionCall.args;
     
     if (functionName === "registrar_cliente") {
        // Llamar a nuestro propio Backend para que haga toda la magia (Incluyendo enviar el Cupón de Bienvenida)
        const clientePayload = {
           nombre: args.nombre,
           whatsapp: phone, // Inyectamos el teléfono real tomado del webhook (phone)
           calle: args.direccion
        };
        try {
            const regRes = await fetch('https://global-sales-prediction.vercel.app/api/loyverse/clients', {
                method: 'POST',
                headers: { 
                  Authorization: `Bearer ${loyverseToken}`, 
                  'Content-Type': 'application/json' 
                },
                body: JSON.stringify(clientePayload)
            });
            const regData = await regRes.json();
            if (regRes.ok) {
               replyText = `✅ ¡Listo ${args.nombre}! Tus datos se han guardado exitosamente y he disparado tu REGALO DE BIENVENIDA 🎁.\n\nAhora dime, ¿en qué te puedo ayudar hoy?\n1- Revisar tus puntos acumulados\n2- Editar tus datos`;
            } else {
               replyText = `❌ Error al registrarte en el sistema: ${regData.error || 'Intenta más tarde'}`;
            }
        } catch(e) {
            console.error("Error al registrar cliente via interno:", e);
            replyText = "Ocurrió un error al intentar crear tu registro. Intenta más tarde.";
        }
     }
     
     if (functionName === "ver_puntos") {
        // En Loyverse los puntos vienen en total_points
        const puntos = customerData?.total_points || 0;
        replyText = `🎁 Tienes **${puntos} puntos** acumulados en tu cuenta. ¡Sigue comprando para ganar más recompensas!`;
     }

     if (functionName === "editar_datos") {
        // Solo simulación de que actualizamos, el PUT a Loyverse iría aquí
        replyText = `📝 He actualizado tu ${args.campo} exitosamente por: ${args.nuevo_valor}.\n¿Deseas algo más?\n1- Ver puntos\n2- Volver a editar`;
     }
  }

  // 7. Guardar el nuevo historial
  history.push({ role: 'model', parts: [{ text: replyText }] });
  await redis.setex(`chat_hist_${phone}`, 86400, history); // Expira en 24 horas

  return replyText;
}
