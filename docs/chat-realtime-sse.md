# Chat web en tiempo real con SSE

Esta seccion documenta el flujo actual del chat web tipo WhatsApp. El proyecto no usa Meta API; los mensajes salen y entran por el gateway Wapp/Baileys y la UI se sincroniza con Server-Sent Events (SSE).

## Objetivo

- Evitar polling de lista de chats y mensajes.
- Reducir ancho de banda y lecturas repetitivas a Redis.
- Mantener varias pestanas del dashboard sincronizadas en tiempo real.
- Evitar perdida de eventos cuando llegan mensajes, ACKs o cambios de estado muy juntos.

## Arquitectura

```mermaid
flowchart LR
  Gateway["Gateway Wapp / Baileys"] --> Webhook["/api/whatsapp/webhook"]
  WebUI["Chat web"] --> Send["/api/whatsapp/send"]
  WebUI --> Actions["mark-read / bot-silence / groups / block / system-mode"]
  Webhook --> History["Redis: chat_hist_*"]
  Send --> History
  Actions --> State["Redis: estado de chat"]
  Webhook --> PubSub["Redis Pub/Sub: chat_events"]
  Send --> PubSub
  Actions --> PubSub
  PubSub --> SSE["/api/whatsapp/sse"]
  SSE --> WebUI
  WebUI --> Reads["/api/whatsapp/chats + /api/whatsapp/history"]
  Reads --> History
  Reads --> State
```

## Flujo del frontend

El archivo principal es `src/app/chat/page.js`.

- Al cargar la pagina se hace una sincronizacion inicial con `/api/whatsapp/chats?limit=10&offset=0`.
- Al abrir un chat se carga `/api/whatsapp/history?phone=...`.
- Despues de eso, no hay intervalos de polling para lista ni mensajes.
- La UI abre `EventSource('/api/whatsapp/sse')`.
- Cada evento `chat:update` dispara:
  - parche local de la fila cuando el evento trae metadatos de chat;
  - actualizacion local de ACKs/palomitas, typing, leido/no leido y modo online/offline;
  - refresco de primera pagina solo cuando el evento no trae datos suficientes para parchear;
  - refresco del historial solo si el evento corresponde al chat activo.
- Al volver a una pestana visible se hace una sincronizacion unica para cubrir pausas del navegador.

El unico `setInterval` relacionado con SSE es un heartbeat de servidor cada 20 segundos para mantener viva la conexion; no consulta datos.

## Lista de chats

`/api/whatsapp/chats` entrega paginas de 10 conversaciones por defecto:

```txt
/api/whatsapp/chats?limit=10&offset=0
/api/whatsapp/chats?limit=10&offset=10
```

La respuesta incluye `total`, `nextOffset` y `hasMore`. El panel usa `react-virtuoso` y pide la siguiente pagina al llegar al final del scroll, asi la primera carga no arrastra cientos de historiales ni fotos.

El endpoint lee primero `chat_meta_*`, `chat_unread_*`, sucursal, estado humano, modo delivery y bloqueo en batch. Solo consulta el historial completo cuando falta metadata legacy; al migrar, guarda `chat_meta_*` para que las siguientes lecturas sean ligeras.

## Retencion

En cada lectura de `/api/whatsapp/chats` se eliminan conversaciones no fijadas con mas de 30 dias sin actividad:

- historial `chat_hist_*`;
- metadata `chat_meta_*`;
- contadores/estado de chat;
- foto de perfil cacheada;
- membresia en `chat_phones`.

No se borran grupos fijados ni datos de cliente Loyverse por esta limpieza automatica.

## Imagenes

Las imagenes seleccionadas en el compositor y en Venta Sugestiva se comprimen en el navegador antes de enviarse:

- dimension maxima: 1280 px en el lado mas largo;
- salida JPEG con calidad 0.72;
- si la version comprimida no pesa menos, se conserva el archivo original;
- los GIFs se conservan sin convertir para no perder animacion.

Las fotos de perfil ya no se cargan para todos los chats de golpe: se encolan solamente para las filas visibles del listado virtualizado, con un maximo de 3 descargas concurrentes.

## Canal de eventos

El helper central esta en `src/lib/realtime.js`.

```js
publishChatEvent({ phone, redisPhone, reason })
```

Publica en:

- `chat_events`: canal Redis Pub/Sub usado por SSE.
- `sse_notify_last`: ultimo evento para diagnostico rapido.

Campos:

- `type`: actualmente `chat:update`.
- `ts`: timestamp del evento.
- `phone`: identificador visible del chat. Puede ser telefono normal o JID de grupo.
- `redisPhone`: identificador normalizado usado para Redis cuando aplica.
- `reason`: origen del evento.

## Productores de eventos

Estos endpoints publican eventos en `chat_events`:

- `src/app/api/whatsapp/webhook/route.js`
  - mensajes entrantes;
  - mensajes de grupos;
  - respuestas automaticas del bot;
  - ACKs de entrega/lectura;
  - typing/presence;
  - pedidos de catalogo.
- `src/app/api/whatsapp/send/route.js`
  - mensajes manuales enviados desde la UI.
- `src/app/api/whatsapp/mark-read/route.js`
  - marcar como leido/no leido.
- `src/app/api/whatsapp/bot-silence/route.js`
  - silenciar/reactivar bot.
- `src/app/api/whatsapp/groups/route.js`
  - fijar, renombrar o desfijar grupos.
- `src/app/api/whatsapp/block/route.js`
  - bloquear/desbloquear contacto.
- `src/app/api/whatsapp/create-chat/route.js`
  - crear chat manual.
- `src/app/api/whatsapp/system-mode/route.js`
  - modo online/offline.

## SSE backend

El endpoint `src/app/api/whatsapp/sse/route.js`:

- corre en runtime Node.js;
- se suscribe a `chat_events`;
- envia cada mensaje Pub/Sub como evento SSE;
- envia heartbeats `: keepalive` cada 20 segundos;
- cierra la suscripcion Redis cuando el navegador aborta la conexion.

## Redis requerido

Para tiempo real completo se necesita `REDIS_URL` con soporte Pub/Sub.

El cliente `src/lib/redis.js` expone:

- `publish(channel, value)`;
- `subscribe(channel, onMessage)`.

Si se usa KV REST sin Pub/Sub, el build no falla, pero la conexion SSE no recibira eventos reales. En produccion debe configurarse un Redis compatible con Pub/Sub.

## Diagnostico rapido

1. Abrir `/chat` y confirmar que existe una conexion `EventSource` a `/api/whatsapp/sse`.
2. Enviar un mensaje desde el gateway o desde la UI.
3. Revisar que `sse_notify_last` cambie en Redis.
4. Si `sse_notify_last` cambia pero la UI no refresca, revisar `/api/whatsapp/sse`.
5. Si `sse_notify_last` no cambia, revisar el endpoint productor del evento.
6. Si grupos no refrescan, revisar que el evento incluya `phone` con JID y `redisPhone` normalizado.

## Verificacion antes de deploy

```bash
npm run build
```

`npm run lint` actualmente tiene deuda fuera del cambio SSE:

- `src/app/promociones/page.js`: comillas sin escapar.
- `src/components/Sidebar.js`: regla React Compiler sobre `setState` en efecto.
- `temp.js`: error de parseo.

La seccion de chat puede mostrar warnings por `<img>`, pero no errores bloqueantes del cambio SSE.
