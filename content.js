// Content script (world ISOLADO): faz a ponte entre o interceptador e o storage.
//
// Recebe as notas capturadas passivamente pelo interceptor.js (que escuta as
// respostas da própria página) e salva em chrome.storage.local. Também mantém
// uma captura via DOM como reserva, caso a tabela chegue a ser renderizada.
//
// Nada aqui dispara requisições.

const STORAGE_KEY = 'academicGradeExtension_capturedTasks';

const isGradesPage = () => location.href.includes('/academic-life');

// Evita gravações repetidas quando o conteúdo não mudou.
let lastSerialized = null;
function store(tasks, source) {
  if (!tasks || tasks.length === 0) return;
  const serialized = JSON.stringify(tasks);
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;

  chrome.storage.local.set({
    [STORAGE_KEY]: {
      tasks,
      capturedAt: Date.now(),
      url: location.href,
      source,
    },
  });
  console.log(`[Calculadora de Média] ${tasks.length} notas salvas (origem: ${source}).`);
}

// === 1) Interceptação passiva (fonte principal) ===
// Recebe os dados que o interceptor.js extraiu das respostas da própria página.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'calcMedia' || data.type !== 'grades') return;
  store(data.tasks, 'rede');
});

// === 2) Captura via DOM (fallback) ===
// Só produz resultado se a tabela de notas chegar a ser renderizada na página.
function extractTasksFromDom() {
  let table = document.querySelector('table.table-grade');

  if (!table) {
    const candidates = document.querySelectorAll('table');
    for (const candidate of candidates) {
      if (
        candidate.textContent.includes('Nota') ||
        candidate.textContent.includes('Peso') ||
        candidate.querySelector('th')?.textContent.includes('Atividade')
      ) {
        table = candidate;
        break;
      }
    }
  }

  if (!table) return null;

  const rows = table.querySelectorAll('tbody tr');
  if (!rows || rows.length === 0) return null;

  const tasks = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return;

    // [0] título, [1] semana, [2] status, [3] peso, [4] nota
    const name = cells[0].textContent.trim();
    const week = cells[1].textContent.trim();
    const status = cells[2].textContent.trim();
    const weight = parseFloat(cells[3].textContent.trim().replace(',', '.')) || 0;
    const gradeText = cells[4].textContent.trim();
    const grade = gradeText !== '-' && gradeText !== ''
      ? parseFloat(gradeText.replace(',', '.'))
      : null;

    if (name) tasks.push({ name, week, status, weight, grade });
  });

  return tasks.length > 0 ? tasks : null;
}

let debounceTimer = null;
function scheduleDomCapture() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const tasks = extractTasksFromDom();
    if (tasks) store(tasks, 'dom');
  }, 400);
}

function initDomFallback() {
  const start = () => {
    scheduleDomCapture();
    const observer = new MutationObserver(scheduleDomCapture);
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

if (isGradesPage()) {
  initDomFallback();
}
