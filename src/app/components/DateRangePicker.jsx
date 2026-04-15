import React, { useState, useEffect } from 'react';
import { 
  format, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  addMonths, 
  subMonths, 
  isSameMonth, 
  isSameDay, 
  isAfter, 
  isBefore, 
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  parse,
  isValid
} from 'date-fns';
import { es } from 'date-fns/locale';

export default function DateRangePicker({ initialStart, initialEnd, onApply, onCancel }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(initialStart || new Date()));
  const [startDate, setStartDate] = useState(initialStart ? new Date(initialStart) : new Date());
  const [endDate, setEndDate] = useState(initialEnd ? new Date(initialEnd) : new Date());
  
  const [startInput, setStartInput] = useState(format(startDate, 'dd/MM/yyyy'));
  const [endInput, setEndInput] = useState(format(endDate, 'dd/MM/yyyy'));

  useEffect(() => {
    setStartInput(format(startDate, 'dd/MM/yyyy'));
  }, [startDate]);

  useEffect(() => {
    setEndInput(format(endDate, 'dd/MM/yyyy'));
  }, [endDate]);

  const handleApply = () => {
    onApply({
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd')
    });
  };

  const setPreset = (preset) => {
    const today = new Date();
    let start, end;
    switch (preset) {
      case 'Hoy':
        start = today;
        end = today;
        break;
      case 'Ayer':
        start = subDays(today, 1);
        end = subDays(today, 1);
        break;
      case 'Esta semana':
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = today;
        break;
      case 'Última semana':
        start = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        end = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        break;
      case 'Este mes':
        start = startOfMonth(today);
        end = today;
        break;
      case 'Último mes':
        const lastMonth = subMonths(today, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      case 'Últimos 7 días':
        start = subDays(today, 6);
        end = today;
        break;
      case 'Últimos 30 Días':
        start = subDays(today, 29);
        end = today;
        break;
      default:
        return;
    }
    setStartDate(start);
    setEndDate(end);
    setCurrentMonth(end);
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleDateClick = (day) => {
    if ((startDate && endDate && !isSameDay(startDate, endDate)) || !startDate) {
      setStartDate(day);
      setEndDate(day);
    } 
    else {
      if (isBefore(day, startDate)) {
        setStartDate(day);
        setEndDate(day);
      } else {
        setEndDate(day);
      }
    }
  };

  const handleInputChange = (field, value) => {
    if (field === 'start') setStartInput(value);
    if (field === 'end') setEndInput(value);

    // Try parsing
    const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
    if (isValid(parsedDate)) {
      if (field === 'start') {
        setStartDate(parsedDate);
        if (isBefore(endDate, parsedDate)) setEndDate(parsedDate);
        setCurrentMonth(parsedDate);
      } else {
        setEndDate(parsedDate);
        if (isAfter(startDate, parsedDate)) setStartDate(parsedDate);
        setCurrentMonth(parsedDate);
      }
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDateInt = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDateInt = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateCells = eachDayOfInterval({ start: startDateInt, end: endDateInt });

  const dateFormat = "MMMM 'de' yyyy";
  const days = ['Lu', 'Ma', 'Mié', 'Jue', 'Vi', 'Sáb', 'Do'];

  return (
    <div className="drp-overlay">
      <div className="drp-modal" onClick={e => e.stopPropagation()}>
        <div className="drp-body">
          <div className="drp-calendar-panel">
            <div className="drp-header">
              <button className="drp-arrow" onClick={prevMonth}>&lt;</button>
              <span className="drp-month-title">
                {format(currentMonth, dateFormat, { locale: es })}
              </span>
              <button className="drp-arrow" onClick={nextMonth} style={{color: 'transparent', pointerEvents: 'none'}}>&gt;</button>
            </div>

            <div className="drp-weekdays">
              {days.map(d => <div key={d}>{d}</div>)}
            </div>

            <div className="drp-grid">
              {dateCells.map(day => {
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelectedStart = startDate && isSameDay(day, startDate);
                const isSelectedEnd = endDate && isSameDay(day, endDate);
                const isBetween = startDate && endDate && isAfter(day, startDate) && isBefore(day, endDate);
                const isToday = isSameDay(day, new Date());
                
                let className = 'drp-day';
                if (!isCurrentMonth) className += ' drp-outside-month';
                if (isSelectedStart) className += ' drp-selected-start';
                if (isSelectedEnd && !isSelectedStart) className += ' drp-selected-end';
                if (isBetween) className += ' drp-in-range';
                if (isToday && !isSelectedStart && !isSelectedEnd) className += ' drp-today';

                return (
                  <div 
                    key={day.toString()} 
                    className={className}
                    onClick={() => handleDateClick(day)}
                  >
                    <div className="drp-day-content">
                      {format(day, 'dd')}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="drp-inputs">
              <div className="drp-input-group">
                <label>Fecha de inicio</label>
                <input 
                  type="text" 
                  value={startInput} 
                  onChange={(e) => handleInputChange('start', e.target.value)}
                />
              </div>
              <div className="drp-input-group">
                <label>Fecha de finalización</label>
                <input 
                  type="text" 
                  value={endInput} 
                  onChange={(e) => handleInputChange('end', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="drp-presets-panel">
            {[
              'Hoy', 'Ayer', 'Esta semana', 'Última semana', 
              'Este mes', 'Último mes', 'Últimos 7 días', 'Últimos 30 Días'
            ].map(preset => (
              <button 
                key={preset} 
                className="drp-preset-btn"
                onClick={() => setPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="drp-footer">
          <button className="drp-btn drp-cancel" onClick={onCancel}>CANCELAR</button>
          <button className="drp-btn drp-apply" onClick={handleApply}>HECHO</button>
        </div>
      </div>
    </div>
  );
}
