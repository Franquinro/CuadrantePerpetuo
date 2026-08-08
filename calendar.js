/**
 * Qadrant - Motor del Calendario Perpetuo (2005 - 2040)
 * Soporta PWA Offline, Guardado de Turno Predeterminado (Candado) y Vista Mes Completo
 */

// Registrar PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js')
            .then(function (reg) {
                console.log('PWA Service Worker registrado correctamente:', reg.scope);
            })
            .catch(function (err) {
                console.warn('Registro de Service Worker omitido:', err);
            });
    });
}

document.addEventListener("DOMContentLoaded", function () {
    CanvasCalendar.initialize();
});

// Variables globales
var thisMonth, thisYear;
var selectedDate = new Date();
var turno = 0; // 0: Turno A, 1: Turno B, ..., 5: Turno F
var vistaActual = 'turno'; // 'turno' o 'mes'
var isTurnoLocked = false;

// Rango de años soportados por el cuadrante
var primerAnio = 2005;
var ultimoAnyo = 2040;

// Mapa de datos del cuadrante: Key "YYYY-MM-DD" -> Array [shiftA, shiftB, shiftC, shiftD, shiftE, shiftF]
var cuadranteMap = {};

// Array de festivos mantenido de la versión original
var festivos = [
    "20110101", "20110106", "20110421", "20110422", "20110530", "20110815", "20110908", "20111012", "20111101", "20111206", "20111208", "20111226",
    "20120101", "20120106", "20120405", "20120406", "20120501", "20120530", "20120815", "20121012", "20121101", "20121206", "20121208", "20121225",
    "20130101", "20130106", "20130328", "20130329", "20130530", "20130815", "20130908", "20131012", "20131101", "20131206", "20131208", "20131225",
    "20140101", "20140106", "20140417", "20140418", "20140501", "20140530", "20140815", "20141013", "20141101", "20141206", "20141208", "20141225",
    "20150101", "20150106", "20150402", "20150403", "20150501", "20150530", "20150815", "20151012", "20151102", "20151208", "20151225",
    "20160101", "20160106", "20160324", "20160325", "20160502", "20160530", "20160815", "20161012", "20161101", "20161206", "20161208",
    "20170101", "20170106", "20170413", "20170414", "20170501", "20170530", "20170815", "20171012", "20171101", "20171206", "20171208", "20171225",
    "20180101", "20180106", "20180329", "20180330", "20180501", "20180530", "20180815", "20181012", "20181101", "20181206", "20181208", "20181225",
    "20190101", "20190106", "20190419", "20190501", "20190530", "20190815", "20191012", "20191101", "20191206", "20191208", "20191225",
    "20200101", "20200106", "20200409", "20200410", "20200501", "20200530", "20200815", "20201012", "20201207", "20201208", "20201225",
    "20210101", "20210106", "20210401", "20210402", "20210501", "20210816", "20211012", "20211101", "20211206", "20211208", "20211225",
    "20220101", "20220106", "20220414", "20220415", "20220530", "20220815", "20221012", "20221101", "20221206", "20221208", "20221226",
    "20230101", "20230106", "20230406", "20230407", "20230501", "20230530", "20230815", "20231012", "20231101", "20231206", "20231208", "20231225",
    "20240101", "20240106", "20240328", "20240329", "20240501", "20240530", "20240815", "20241012", "20241101", "20241206", "20241208", "20241225",
    "20250101", "20250106", "20250417", "20250418", "20250501", "20250530", "20250815", "20251012", "20251101", "20251206", "20251208", "20251225"
];

window.CanvasCalendar = {
    initialize: function () {
        var myElement = document.getElementById('calendar-container');

        if (typeof Hammer !== 'undefined' && myElement) {
            try {
                var mc = new Hammer(myElement);
                mc.get('swipe').set({ direction: Hammer.DIRECTION_ALL });

                mc.on("swipeleft swiperight swipeup swipedown", function (ev) {
                    if (ev.type == "swipeleft") mesMas();
                    if (ev.type == "swiperight") mesMenos();
                    if (ev.type == "swipedown") turnoMenos();
                    if (ev.type == "swipeup") turnoMas();
                });
            } catch (e) {
                console.warn("Hammer.js no iniciado:", e);
            }
        }

        // Cargar datos del bundle JS síncrono si está disponible
        if (window.CUADRANTE_DATA) {
            cuadranteMap = window.CUADRANTE_DATA;
        }

        // Inicializar fecha
        thisMonth = selectedDate.getMonth() + 1;
        thisYear = selectedDate.getFullYear();
        if (thisYear < primerAnio) thisYear = primerAnio;
        if (thisYear > ultimoAnyo) thisYear = ultimoAnyo;

        // Cargar turno guardado por defecto (localStorage o cookie)
        this.checkSavedTurno();

        var elTurno = document.getElementById('turnoDef');
        if (elTurno) {
            elTurno.value = turno.toString();
            elTurno.addEventListener('change', function () {
                turno = parseInt(this.value);
                if (isTurnoLocked) {
                    localStorage.setItem('turnoDef', turno.toString());
                    setCookie('turnoDef', turno.toString(), 365);
                }
                CanvasCalendar.refreshCalendar();
            });
        }

        this.updateLockUI();

        // Poblar selectores de Mes y Año
        this.populateMonthSelector();
        this.populateYearSelector();

        // Cargar CSV dinámico en segundo plano
        this.loadCSV(function () {
            CanvasCalendar.refreshCalendar();
        });

        // Renderizado inicial
        this.refreshCalendar();
    },

    checkSavedTurno: function () {
        var saved = localStorage.getItem('turnoDef') || getCookie('turnoDef');
        var lockedState = localStorage.getItem('turnoLocked') || getCookie('turnoLocked');

        if (saved !== null && saved !== '') {
            turno = parseInt(saved);
            if (isNaN(turno) || turno < 0 || turno > 5) turno = 0;
            isTurnoLocked = (lockedState === 'true' || saved !== '');
        } else {
            isTurnoLocked = false;
        }
    },

    updateLockUI: function () {
        var lockBtn = document.getElementById('lockBtn');
        if (!lockBtn) return;

        if (isTurnoLocked) {
            lockBtn.classList.add('locked');
            lockBtn.setAttribute('title', 'Turno predeterminado bloqueado. Haz clic para desbloquear');
            lockBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        } else {
            lockBtn.classList.remove('locked');
            lockBtn.setAttribute('title', 'Bloquear turno por defecto');
            lockBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
        }
    },

    loadCSV: function (callback) {
        var csvFile = 'cuadrante_perpetuo_iniciales.csv';
        fetch(csvFile)
            .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.text();
            })
            .then(function (text) {
                CanvasCalendar.parseCSV(text);
                if (callback) callback();
            })
            .catch(function (err) {
                console.info("Uso de datos síncronos CUADRANTE_DATA activo.");
            });
    },

    parseCSV: function (text) {
        var lines = text.split(/\r?\n/);
        for (var i = 1; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            var parts = line.split(';');
            if (parts.length < 7) continue;

            var fechaFull = parts[0].trim();
            var dateStr = fechaFull.substring(fechaFull.length - 10);
            
            var dateParts = dateStr.split('/');
            if (dateParts.length === 3) {
                var day = dateParts[0].padStart(2, '0');
                var month = dateParts[1].padStart(2, '0');
                var year = dateParts[2];
                var key = year + "-" + month + "-" + day;
                
                cuadranteMap[key] = [
                    parts[1].trim(), // Turno A
                    parts[2].trim(), // Turno B
                    parts[3].trim(), // Turno C
                    parts[4].trim(), // Turno D
                    parts[5].trim(), // Turno E
                    parts[6].trim()  // Turno F
                ];
            }
        }
    },

    populateMonthSelector: function () {
        var monthSelect = document.getElementById('monthSelect');
        if (!monthSelect) return;

        var meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthSelect.innerHTML = "";
        for (var m = 0; m < 12; m++) {
            var opt = document.createElement('option');
            opt.value = m + 1;
            opt.innerText = meses[m];
            if ((m + 1) === thisMonth) opt.selected = true;
            monthSelect.appendChild(opt);
        }

        monthSelect.addEventListener('change', function () {
            thisMonth = parseInt(this.value);
            selectedDate.setMonth(thisMonth - 1);
            CanvasCalendar.refreshCalendar();
        });
    },

    populateYearSelector: function () {
        var yearSelect = document.getElementById('yearSelect');
        if (!yearSelect) return;

        yearSelect.innerHTML = "";
        for (var y = primerAnio; y <= ultimoAnyo; y++) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.innerText = y;
            if (y === thisYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }

        yearSelect.addEventListener('change', function () {
            thisYear = parseInt(this.value);
            selectedDate.setFullYear(thisYear);
            CanvasCalendar.refreshCalendar();
        });
    },

    refreshCalendar: function () {
        var textoTurno = ["TURNO A", "TURNO B", "TURNO C", "TURNO D", "TURNO E", "TURNO F"];
        
        var turnoEl = document.getElementById("turno");
        var appTitleEl = document.getElementById("appTitle");
        var monthSelect = document.getElementById("monthSelect");
        var yearSelect = document.getElementById("yearSelect");

        var containerTurno = document.getElementById('calendar-container');
        var containerFull = document.getElementById('full-month-container');
        var configCard = document.getElementById('config-card');
        var mainContainer = document.querySelector('.main-container');

        if (appTitleEl) appTitleEl.innerText = "QADRANT INFINITO";
        if (monthSelect) monthSelect.value = thisMonth;
        if (yearSelect) yearSelect.value = thisYear;

        if (vistaActual === 'turno') {
            if (mainContainer) mainContainer.classList.remove('vista-mes-modo');
            if (turnoEl) {
                turnoEl.innerText = textoTurno[turno];
                turnoEl.style.display = 'block';
            }
            if (containerTurno) containerTurno.style.display = 'block';
            if (containerFull) containerFull.style.display = 'none';
            if (configCard) configCard.style.display = 'block'; // Mostrar configuración en vista turno

            this.drawCalendarDOM();
        } else {
            // Vista Mes Completo
            if (mainContainer) mainContainer.classList.add('vista-mes-modo');
            if (turnoEl) {
                turnoEl.innerText = "TODOS LOS TURNOS";
                turnoEl.style.display = 'block';
            }
            if (containerTurno) containerTurno.style.display = 'none';
            if (containerFull) containerFull.style.display = 'block';
            if (configCard) configCard.style.display = 'none'; // OCULTAR configuración en modo mes completo

            this.drawFullMonthDOM();
        }
    },

    drawCalendarDOM: function () {
        var grid = document.getElementById('calendar-grid');
        if (!grid) return;

        grid.innerHTML = "";

        var prevMonthLastDate = getLastDayOfMonth(thisMonth - 1, thisYear);
        var thisMonthLastDate = getLastDayOfMonth(thisMonth, thisYear);

        var firstDayObj = new Date(thisYear, thisMonth - 1, 1);
        var thisMonthFirstDay = firstDayObj.getDay() - 1;
        if (thisMonthFirstDay < 0) thisMonthFirstDay = 6; // Lunes=0, Domingo=6

        var monthDay = 0;
        var dateOffset = thisMonthFirstDay;

        for (var j = 0; j < 6; j++) {
            for (var i = 0; i < 7; i++) {
                var cell = document.createElement('div');
                cell.className = 'day-cell';

                var dayNumber = 0;
                var isCurrentMonth = false;
                var targetYear = thisYear;
                var targetMonth = thisMonth;

                if (j === 0 && i < thisMonthFirstDay) {
                    dayNumber = prevMonthLastDate - (dateOffset - i) + 1;
                    cell.classList.add('other-month');
                    targetMonth = thisMonth - 1;
                    if (targetMonth < 1) {
                        targetMonth = 12;
                        targetYear = thisYear - 1;
                    }
                } else if (monthDay < thisMonthLastDate) {
                    monthDay++;
                    dayNumber = monthDay;
                    isCurrentMonth = true;
                } else {
                    monthDay++;
                    dayNumber = monthDay - thisMonthLastDate;
                    cell.classList.add('other-month');
                    targetMonth = thisMonth + 1;
                    if (targetMonth > 12) {
                        targetMonth = 1;
                        targetYear = thisYear + 1;
                    }
                }

                var dayNumSpan = document.createElement('span');
                dayNumSpan.className = 'day-number';
                dayNumSpan.innerText = dayNumber;
                cell.appendChild(dayNumSpan);

                var yStr = targetYear.toString();
                var mStr = targetMonth.toString().padStart(2, '0');
                var dStr = dayNumber.toString().padStart(2, '0');
                var dateKey = yStr + "-" + mStr + "-" + dStr;

                var shifts = cuadranteMap[dateKey];
                if (shifts) {
                    var shiftCode = typeof shifts === 'string' ? shifts[turno] : shifts[turno];
                    if (shiftCode) {
                        cell.classList.add('shift-' + shiftCode);
                    }
                }

                if (isCurrentMonth) {
                    var dateString = thisYear.toString() + mStr + dStr;

                    if (i === 6 || festivos.includes(dateString)) {
                        cell.classList.add('is-holiday');
                    }

                    var today = new Date();
                    if (dayNumber === today.getDate() &&
                        thisMonth === (today.getMonth() + 1) &&
                        thisYear === today.getFullYear()) {
                        cell.classList.add('is-today');

                        var todayLabel = document.createElement('span');
                        todayLabel.className = 'today-label';
                        todayLabel.innerText = 'HOY';
                        cell.appendChild(todayLabel);
                    }
                }

                grid.appendChild(cell);
            }
        }
    },

    drawFullMonthDOM: function () {
        var container = document.getElementById('full-month-container');
        if (!container) return;

        var daysInMonth = getLastDayOfMonth(thisMonth, thisYear);
        var dowInitials = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        var turnos = ['Turno A', 'Turno B', 'Turno C', 'Turno D', 'Turno E', 'Turno F'];

        var html = '<div class="full-month-card">';
        html += '<div class="full-month-wrapper">';
        html += '<table class="full-month-table">';

        // Fila 1: Iniciales de días de la semana
        html += '<thead><tr>';
        html += '<th class="sticky-col">Turno</th>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dateObj = new Date(thisYear, thisMonth - 1, d);
            var dowIdx = dateObj.getDay() - 1;
            if (dowIdx < 0) dowIdx = 6;
            
            var mStr = thisMonth.toString().padStart(2, '0');
            var dStr = d.toString().padStart(2, '0');
            var dateString = thisYear.toString() + mStr + dStr;
            
            var isHoliday = (dowIdx === 6 || festivos.includes(dateString));
            var cls = isHoliday ? 'day-hdr is-holiday' : 'day-hdr';
            
            html += '<th class="' + cls + '">' + dowInitials[dowIdx] + '</th>';
        }
        html += '</tr>';

        // Fila 2: Números de días
        html += '<tr>';
        html += '<th class="sticky-col">Día</th>';
        var today = new Date();
        for (var d = 1; d <= daysInMonth; d++) {
            var dateObj = new Date(thisYear, thisMonth - 1, d);
            var dowIdx = dateObj.getDay() - 1;
            if (dowIdx < 0) dowIdx = 6;
            
            var mStr = thisMonth.toString().padStart(2, '0');
            var dStr = d.toString().padStart(2, '0');
            var dateString = thisYear.toString() + mStr + dStr;
            
            var isHoliday = (dowIdx === 6 || festivos.includes(dateString));
            var isToday = (d === today.getDate() && thisMonth === (today.getMonth() + 1) && thisYear === today.getFullYear());
            
            var cls = 'day-num-hdr';
            if (isHoliday) cls += ' is-holiday';
            if (isToday) cls += ' is-today';
            
            html += '<th class="' + cls + '">' + d + '</th>';
        }
        html += '</tr></thead>';

        // Filas para Turnos A - F
        html += '<tbody>';
        for (var t = 0; t < 6; t++) {
            html += '<tr>';
            html += '<td class="sticky-col">' + turnos[t] + '</td>';
            
            for (var d = 1; d <= daysInMonth; d++) {
                var mStr = thisMonth.toString().padStart(2, '0');
                var dStr = d.toString().padStart(2, '0');
                var dateKey = thisYear.toString() + "-" + mStr + "-" + dStr;
                
                var shifts = cuadranteMap[dateKey];
                var shiftCode = (shifts && shifts[t]) ? shifts[t] : '';
                
                var isToday = (d === today.getDate() && thisMonth === (today.getMonth() + 1) && thisYear === today.getFullYear());
                var cellCls = 'matrix-cell shift-' + shiftCode;
                if (isToday) cellCls += ' is-today';
                
                html += '<td class="' + cellCls + '">' + shiftCode + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table></div></div>';

        container.innerHTML = html;
    }
};

// Funciones auxiliares
function getLastDayOfMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/;SameSite=Lax";
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

// Acción de Bloquear / Guardar Turno Predeterminado (Candado)
window.toggleLockTurno = function () {
    if (isTurnoLocked) {
        isTurnoLocked = false;
        localStorage.removeItem('turnoDef');
        localStorage.removeItem('turnoLocked');
        setCookie('turnoDef', '', -1);
        setCookie('turnoLocked', '', -1);
    } else {
        isTurnoLocked = true;
        localStorage.setItem('turnoDef', turno.toString());
        localStorage.setItem('turnoLocked', 'true');
        setCookie('turnoDef', turno.toString(), 365);
        setCookie('turnoLocked', 'true', 365);
    }
    CanvasCalendar.updateLockUI();
};

// Funciones globales de navegación
window.setVista = function (modo) {
    vistaActual = modo;
    var btnTurno = document.getElementById('btnVistaTurno');
    var btnMes = document.getElementById('btnVistaMes');
    if (btnTurno && btnMes) {
        if (modo === 'turno') {
            btnTurno.classList.add('active');
            btnMes.classList.remove('active');
        } else {
            btnTurno.classList.remove('active');
            btnMes.classList.add('active');
        }
    }
    CanvasCalendar.refreshCalendar();
};

window.mesMas = function () {
    if (selectedDate.getMonth() == 11 && selectedDate.getFullYear() == ultimoAnyo) return;
    if (selectedDate.getFullYear() > ultimoAnyo) return;
    selectedDate.setMonth(selectedDate.getMonth() + 1);
    thisMonth = selectedDate.getMonth() + 1;
    thisYear = selectedDate.getFullYear();
    CanvasCalendar.refreshCalendar();
};

window.mesMenos = function () {
    if (selectedDate.getMonth() == 0 && selectedDate.getFullYear() == primerAnio) return;
    selectedDate.setMonth(selectedDate.getMonth() - 1);
    thisMonth = selectedDate.getMonth() + 1;
    thisYear = selectedDate.getFullYear();
    CanvasCalendar.refreshCalendar();
};

window.turnoMas = function () {
    turno++;
    if (turno == 6) turno = 0;
    var elTurno = document.getElementById('turnoDef');
    if (elTurno) elTurno.value = turno.toString();
    if (isTurnoLocked) {
        localStorage.setItem('turnoDef', turno.toString());
        setCookie('turnoDef', turno.toString(), 365);
    }
    CanvasCalendar.refreshCalendar();
};

window.turnoMenos = function () {
    turno--;
    if (turno < 0) turno = 5;
    var elTurno = document.getElementById('turnoDef');
    if (elTurno) elTurno.value = turno.toString();
    if (isTurnoLocked) {
        localStorage.setItem('turnoDef', turno.toString());
        setCookie('turnoDef', turno.toString(), 365);
    }
    CanvasCalendar.refreshCalendar();
};

// --- FUNCIONALIDAD DE EXPORTACIÓN A EXCEL (.XLSX) ---
var modalExportarInstance = null;
var JORNADAS_OFICIALES = {
    2024: 1696,
    2025: 1680,
    2026: 1672,
    2027: 1664,
    2028: 1656
};

window.actualizarJornadaPorAño = function () {
    var yearSelect = document.getElementById('exportYearSelect');
    var jornadaSelect = document.getElementById('exportJornadaSelect');
    if (!yearSelect || !jornadaSelect) return;
    var selYear = parseInt(yearSelect.value);
    var horas = JORNADAS_OFICIALES[selYear] || 1672;
    jornadaSelect.value = horas.toString();
};

window.abrirModalExportar = function () {
    var yearSelect = document.getElementById('exportYearSelect');
    if (yearSelect) {
        yearSelect.innerHTML = "";
        for (var y = primerAnio; y <= ultimoAnyo; y++) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.innerText = "Año " + y;
            if (y === thisYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
    }

    actualizarJornadaPorAño();

    var modalEl = document.getElementById('modalExportar');
    if (modalEl && typeof bootstrap !== 'undefined') {
        modalExportarInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalExportarInstance.show();
    }
};

window.confirmarExportacionExcel = function () {
    var yearSelect = document.getElementById('exportYearSelect');
    var jornadaSelect = document.getElementById('exportJornadaSelect');

    var selYear = yearSelect ? parseInt(yearSelect.value) : thisYear;
    var jornada = jornadaSelect ? parseInt(jornadaSelect.value) : 1672;

    if (isNaN(selYear)) selYear = thisYear;
    if (isNaN(jornada) || jornada <= 0) jornada = 1672;

    var modalEl = document.getElementById('modalExportar');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var inst = bootstrap.Modal.getInstance(modalEl) || modalExportarInstance;
        if (inst) inst.hide();
    }

    generarExcelCuadrante(selYear, jornada);
};

window.generarExcelCuadrante = function (anio, jornadaHoras) {
    if (typeof ExcelJS === 'undefined') {
        alert("La librería de exportación ExcelJS no está cargada.");
        return;
    }

    if (!jornadaHoras || isNaN(jornadaHoras) || jornadaHoras <= 0) {
        jornadaHoras = 1672;
    }

    var workbook = new ExcelJS.Workbook();
    var sheetName = "Cuadrante Provisional " + anio;
    var ws = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }]
    });

    var mesesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    var dowInitials = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    var turnosNombres = ['Turno A', 'Turno B', 'Turno C', 'Turno D', 'Turno E', 'Turno F'];

    // Estilos reutilizables
    var borderThin = {
        top: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        left: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } },
        right: { style: 'thin', color: { argb: 'FFD0D7DE' } }
    };

    var shiftStyles = {
        'M': { fill: 'FF2196F3', font: 'FFFFFFFF' }, // Azul Mañana
        'T': { fill: 'FF4CAF50', font: 'FFFFFFFF' }, // Verde Tarde
        'N': { fill: 'FFFBC02D', font: 'FF000000' }, // Amarillo Noche
        'O': { fill: 'FF9C27B0', font: 'FFFFFFFF' }, // Púrpura Oficio
        'D': { fill: 'FFFFFFFF', font: 'FF37474F' }, // Blanco Descanso
        'V': { fill: 'FFE91E63', font: 'FFFFFFFF' }  // Rosa/Naranja Vacaciones
    };

    // Configurar anchos de columna (Col 1: Turno, Cols 2..32: Días 1..31, Cols 33..37: M,T,N,O,V)
    var colsConfig = [
        { width: 14 } // Col 1 (A)
    ];
    for (var i = 0; i < 31; i++) {
        colsConfig.push({ width: 4.5 }); // Cols 2..32 (B..AF)
    }
    for (var i = 0; i < 5; i++) {
        colsConfig.push({ width: 6.5 }); // Cols 33..37 (AG..AK)
    }
    ws.columns = colsConfig;

    var currentRow = 1;

    // --- FILA 1: TÍTULO PRINCIPAL ---
    ws.mergeCells(currentRow, 1, currentRow, 37);
    var titleCell = ws.getCell(currentRow, 1);
    titleCell.value = "CUADRANTE PROVISIONAL " + anio;
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentRow).height = 36;
    
    for (var c = 1; c <= 37; c++) {
        ws.getCell(currentRow, c).border = borderThin;
    }
    currentRow++;

    // Fila 2: Separador
    ws.getRow(currentRow).height = 12;
    currentRow++;

    // Guardar filas de resumen por turno para el totalizador final
    var turnoSummaryRows = [[], [], [], [], [], []];
    var turnoRowRanges = [];

    // --- RECORRER LOS 12 MESES ---
    for (var m = 1; m <= 12; m++) {
        var daysInMonth = getLastDayOfMonth(m, anio);
        var rMonthHeader = currentRow;

        // 1. Cabecera del Mes (Nombre del Mes YYYY)
        ws.mergeCells(rMonthHeader, 1, rMonthHeader, 37);
        var mCell = ws.getCell(rMonthHeader, 1);
        mCell.value = mesesNombres[m - 1].toUpperCase() + " " + anio;
        mCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
        mCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(rMonthHeader).height = 24;

        for (var c = 1; c <= 37; c++) {
            ws.getCell(rMonthHeader, c).border = borderThin;
        }
        currentRow++;

        // 2. Filas de Cabecera de Días (Días de Semana + Números)
        var rDow = currentRow;
        var rDayNum = currentRow + 1;
        ws.getRow(rDow).height = 18;
        ws.getRow(rDayNum).height = 18;

        // Col 1: Combinar "Turno" verticalmente entre rDow y rDayNum
        ws.mergeCells(rDow, 1, rDayNum, 1);
        var turnoHdr = ws.getCell(rDow, 1);
        turnoHdr.value = "Turno";
        turnoHdr.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
        turnoHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        turnoHdr.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getCell(rDow, 1).border = borderThin;
        ws.getCell(rDayNum, 1).border = borderThin;

        // Cols 2..32 (Días 1..31)
        for (var d = 1; d <= 31; d++) {
            var colIdx = d + 1;
            var cDow = ws.getCell(rDow, colIdx);
            var cNum = ws.getCell(rDayNum, colIdx);

            if (d <= daysInMonth) {
                var dateObj = new Date(anio, m - 1, d);
                var dowIdx = dateObj.getDay() - 1;
                if (dowIdx < 0) dowIdx = 6;
                var dateStr = anio.toString() + m.toString().padStart(2, '0') + d.toString().padStart(2, '0');
                var isHoliday = (dowIdx === 6 || festivos.includes(dateStr));

                var bgFill = isHoliday ? 'FFFCE4D6' : 'FFD9E1F2';
                var txtColor = isHoliday ? 'FFE53935' : 'FF263238';

                cDow.value = dowInitials[dowIdx];
                cDow.font = { name: 'Arial', size: 9, bold: true, color: { argb: txtColor } };
                cDow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } };
                cDow.alignment = { horizontal: 'center', vertical: 'middle' };
                cDow.border = borderThin;

                cNum.value = d;
                cNum.font = { name: 'Arial', size: 9, bold: true, color: { argb: txtColor } };
                cNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } };
                cNum.alignment = { horizontal: 'center', vertical: 'middle' };
                cNum.border = borderThin;
            } else {
                cDow.value = "";
                cDow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                cDow.border = borderThin;

                cNum.value = "";
                cNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                cNum.border = borderThin;
            }
        }

        // Cols 33..37 (AG..AK) -> Combinar verticalmente M, T, N, O, V en las dos filas de cabecera
        var sumHeaders = ["M", "T", "N", "O", "V"];
        for (var s = 0; s < 5; s++) {
            var colIdx = 33 + s;
            ws.mergeCells(rDow, colIdx, rDayNum, colIdx);
            var sumHdrCell = ws.getCell(rDow, colIdx);
            sumHdrCell.value = sumHeaders[s];
            sumHdrCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            sumHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
            sumHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getCell(rDow, colIdx).border = borderThin;
            ws.getCell(rDayNum, colIdx).border = borderThin;
        }

        currentRow += 2;
        var rTurnoStart = currentRow;

        // 3. Filas para Turnos A..F
        for (var t = 0; t < 6; t++) {
            var rTurno = currentRow;
            ws.getRow(rTurno).height = 20;

            // Col 1: Nombre de Turno
            var tNameCell = ws.getCell(rTurno, 1);
            tNameCell.value = turnosNombres[t];
            tNameCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF37474F' } };
            tNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
            tNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
            tNameCell.border = borderThin;

            // Cols 2..32: Días del Mes
            for (var d = 1; d <= 31; d++) {
                var colIdx = d + 1;
                var dayCell = ws.getCell(rTurno, colIdx);

                if (d <= daysInMonth) {
                    var mStr = m.toString().padStart(2, '0');
                    var dStr = d.toString().padStart(2, '0');
                    var dateKey = anio.toString() + "-" + mStr + "-" + dStr;
                    var shifts = cuadranteMap[dateKey];
                    var shiftCode = (shifts && shifts[t]) ? shifts[t] : '';

                    dayCell.value = shiftCode;
                    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
                    dayCell.border = borderThin;
                    dayCell.font = { name: 'Arial', size: 9, bold: true };
                } else {
                    dayCell.value = "";
                    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
                    dayCell.border = borderThin;
                }
            }

            // Cols 33..37 (AG..AK): Fórmulas de resumen M, T, N, O, V del mes
            var rStr = rTurno.toString();
            var sumCodes = ["M", "T", "N", "O", "V"];
            for (var s = 0; s < 5; s++) {
                var colIdx = 33 + s;
                var sCell = ws.getCell(rTurno, colIdx);
                sCell.value = { formula: 'COUNTIF(B' + rStr + ':AF' + rStr + ', "' + sumCodes[s] + '")' };
                sCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
                sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
                sCell.alignment = { horizontal: 'center', vertical: 'middle' };
                sCell.border = borderThin;
            }

            turnoSummaryRows[t].push(rTurno);
            currentRow++;
        }
        var rTurnoEnd = currentRow - 1;
        turnoRowRanges.push('B' + rTurnoStart + ':AF' + rTurnoEnd);

        // 4. Separador de 1 fila en blanco entre meses
        ws.getRow(currentRow).height = 10;
        currentRow++;
    }

    // --- REGLAS DE FORMATO CONDICIONAL EN EXCEL ---
    // (Aplicado EXCLUSIVAMENTE a las filas de Turnos para NO afectar a los días de la semana de la cabecera)
    turnoRowRanges.forEach(function (rangeRef) {
        ws.addConditionalFormatting({
            ref: rangeRef,
            rules: [
                {
                    type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"M"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF2196F3' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true } }
                },
                {
                    type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"T"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF4CAF50' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true } }
                },
                {
                    type: 'cellIs', operator: 'equal', priority: 3, formulae: ['"N"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBC02D' } }, font: { color: { argb: 'FF000000' }, bold: true } }
                },
                {
                    type: 'cellIs', operator: 'equal', priority: 4, formulae: ['"O"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF9C27B0' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true } }
                },
                {
                    type: 'cellIs', operator: 'equal', priority: 5, formulae: ['"D"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFFFFF' } }, font: { color: { argb: 'FF37474F' }, bold: true } }
                },
                {
                    type: 'cellIs', operator: 'equal', priority: 6, formulae: ['"V"'],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE91E63' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true } }
                }
            ]
        });
    });


    // --- SECCIÓN TOTALIZADOR / CALCULADORA DE JORNADA FINAL ---
    // Celdas combinadas de 2 columnas para evitar recortes de texto/números
    
    // Fila Encabezado Calculadora (Merged A:AK = 37 cols)
    ws.mergeCells(currentRow, 1, currentRow, 37);
    var calcTitle = ws.getCell(currentRow, 1);
    calcTitle.value = "CALCULADORA Y TOTALIZADOR DE JORNADA ANUAL";
    calcTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    calcTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    calcTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentRow).height = 30;
    for (var c = 1; c <= 37; c++) {
        ws.getCell(currentRow, c).border = borderThin;
    }
    currentRow++;

    // Fila Parámetro de Jornada Anual (A..AK = 37 cols)
    var rParam = currentRow;
    ws.getRow(rParam).height = 24;

    ws.mergeCells(rParam, 1, rParam, 7); // A..G (7 cols)
    var pLbl1 = ws.getCell(rParam, 1);
    pLbl1.value = "Jornada Anual (horas):";
    pLbl1.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
    pLbl1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    pLbl1.alignment = { horizontal: 'right', vertical: 'middle' };

    ws.mergeCells(rParam, 8, rParam, 12); // H..L (5 cols)
    var pVal1 = ws.getCell(rParam, 8);
    pVal1.value = jornadaHoras;
    pVal1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F4E78' } };
    pVal1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
    pVal1.alignment = { horizontal: 'center', vertical: 'middle' };
    pVal1.numFmt = '#,##0';

    ws.mergeCells(rParam, 13, rParam, 20); // M..T (8 cols)
    var pLbl2 = ws.getCell(rParam, 13);
    pLbl2.value = "Días a trabajar (Jornada/8):";
    pLbl2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
    pLbl2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    pLbl2.alignment = { horizontal: 'right', vertical: 'middle' };

    ws.mergeCells(rParam, 21, rParam, 25); // U..Y (5 cols)
    var pVal2 = ws.getCell(rParam, 21);
    pVal2.value = { formula: 'H' + rParam + '/8' };
    pVal2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF276A3C' } };
    pVal2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    pVal2.alignment = { horizontal: 'center', vertical: 'middle' };
    pVal2.numFmt = '#,##0';

    ws.mergeCells(rParam, 26, rParam, 37); // Z..AK (12 cols)
    var pFill = ws.getCell(rParam, 26);
    pFill.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    for (var c = 1; c <= 37; c++) {
        ws.getCell(rParam, c).border = borderThin;
    }
    currentRow++;

    // Separador
    ws.getRow(currentRow).height = 10;
    currentRow++;

    // Fila Cabecera Tabla Calculadora (37 columnas repartidas entre 9 campos)
    var rCalcHdr = currentRow;
    ws.getRow(rCalcHdr).height = 24;

    var calcHeaders = [
        { label: "Turno", startCol: 1, endCol: 3 },            // A..C (3 cols)
        { label: "Días a Trabajar", startCol: 4, endCol: 7 },  // D..G (4 cols)
        { label: "Total M", startCol: 8, endCol: 11 },         // H..K (4 cols)
        { label: "Total T", startCol: 12, endCol: 15 },        // L..O (4 cols)
        { label: "Total N", startCol: 16, endCol: 19 },        // P..S (4 cols)
        { label: "Total O", startCol: 20, endCol: 23 },        // T..W (4 cols)
        { label: "Total Trabajados", startCol: 24, endCol: 28 }, // X..AB (5 cols)
        { label: "Diferencia", startCol: 29, endCol: 32 },     // AC..AF (4 cols)
        { label: "Total V", startCol: 33, endCol: 37 }          // AG..AK (5 cols)
    ];

    calcHeaders.forEach(function (h) {
        ws.mergeCells(rCalcHdr, h.startCol, rCalcHdr, h.endCol);
        var hCell = ws.getCell(rCalcHdr, h.startCol);
        hCell.value = h.label;
        hCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        hCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
        hCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    for (var c = 1; c <= 37; c++) {
        ws.getCell(rCalcHdr, c).border = borderThin;
    }
    currentRow++;

    // Filas de Datos del Totalizador por Turno (A..F), ocupando todo el ancho (Cols A..AK)
    var diasTrabajarRefCell = 'U' + rParam;

    for (var t = 0; t < 6; t++) {
        var rTot = currentRow;
        ws.getRow(rTot).height = 22;
        var mRows = turnoSummaryRows[t];

        // 1. Turno (A..C)
        ws.mergeCells(rTot, 1, rTot, 3);
        var c1 = ws.getCell(rTot, 1);
        c1.value = turnosNombres[t];
        c1.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF37474F' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };

        // 2. Días a Trabajar (D..G)
        ws.mergeCells(rTot, 4, rTot, 7);
        var c2 = ws.getCell(rTot, 4);
        c2.value = { formula: diasTrabajarRefCell };
        c2.font = { name: 'Arial', size: 10, bold: true };
        c2.numFmt = '#,##0';

        // 3. Total M (H..K)
        ws.mergeCells(rTot, 8, rTot, 11);
        var c3 = ws.getCell(rTot, 8);
        c3.value = { formula: 'SUM(' + mRows.map(r => 'AG' + r).join(',') + ')' };
        c3.font = { name: 'Arial', size: 10, bold: true };

        // 4. Total T (L..O)
        ws.mergeCells(rTot, 12, rTot, 15);
        var c4 = ws.getCell(rTot, 12);
        c4.value = { formula: 'SUM(' + mRows.map(r => 'AH' + r).join(',') + ')' };
        c4.font = { name: 'Arial', size: 10, bold: true };

        // 5. Total N (P..S)
        ws.mergeCells(rTot, 16, rTot, 19);
        var c5 = ws.getCell(rTot, 16);
        c5.value = { formula: 'SUM(' + mRows.map(r => 'AI' + r).join(',') + ')' };
        c5.font = { name: 'Arial', size: 10, bold: true };

        // 6. Total O (T..W)
        ws.mergeCells(rTot, 20, rTot, 23);
        var c6 = ws.getCell(rTot, 20);
        c6.value = { formula: 'SUM(' + mRows.map(r => 'AJ' + r).join(',') + ')' };
        c6.font = { name: 'Arial', size: 10, bold: true };

        // 7. Total Trabajados (X..AB)
        ws.mergeCells(rTot, 24, rTot, 28);
        var c7 = ws.getCell(rTot, 24);
        c7.value = { formula: 'H' + rTot + '+L' + rTot + '+P' + rTot + '+T' + rTot };
        c7.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
        c7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

        // 8. Diferencia (AC..AF)
        ws.mergeCells(rTot, 29, rTot, 32);
        var c8 = ws.getCell(rTot, 29);
        c8.value = { formula: 'D' + rTot + '-X' + rTot };
        c8.font = { name: 'Arial', size: 10, bold: true };
        c8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
        c8.numFmt = '#,##0;[Red]-#,##0';

        // 9. Total V (AG..AK)
        ws.mergeCells(rTot, 33, rTot, 37);
        var c9 = ws.getCell(rTot, 33);
        c9.value = { formula: 'SUM(' + mRows.map(r => 'AK' + r).join(',') + ')' };
        c9.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF9C0006' } };
        c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };

        for (var c = 1; c <= 37; c++) {
            var cell = ws.getCell(rTot, c);
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = borderThin;
        }
        currentRow++;
    }

    // Exportar archivo descargable con ExcelJS + fallback nativo
    workbook.xlsx.writeBuffer().then(function (buffer) {
        var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(blob, "Cuadrante_Provisional_" + anio + ".xlsx");
    }).catch(function (err) {
        console.error("Error al generar Excel:", err);
        alert("Ocurrió un error al generar el archivo Excel: " + (err.message || err));
    });
};

function downloadBlob(blob, filename) {
    if (typeof saveAs !== 'undefined') {
        saveAs(blob, filename);
        return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
