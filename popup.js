document.addEventListener('DOMContentLoaded', function() {
  const messageElement = document.getElementById('message');
  const taskListElement = document.getElementById('taskList');
  const taskListContainerElement = document.getElementById('taskListContainer');
  const averageValueElement = document.getElementById('averageValue');
  const averageSubElement = document.getElementById('averageSub');
  const averageBarElement = document.getElementById('averageBar');
  const defaultGradeBtnElement = document.getElementById('defaultGradeBtn');
  const clearGradesBtnElement = document.getElementById('clearGradesBtn');
  const reloadContainerElement = document.getElementById('reloadContainer');

  // Chave do localStorage para as notas definidas manualmente pelo usuário
  const STORAGE_KEY = 'academicGradeExtension_grades';
  // Chave do chrome.storage.local onde o content script salva as notas capturadas
  const CAPTURED_KEY = 'academicGradeExtension_capturedTasks';
  // Chave do grupo selecionado e fatores de ajuste da média final por grupo
  const GROUP_KEY = 'academicGradeExtension_group';
  const GROUP_FACTORS = { A: 1.05, B: 1.0, C: 0.95, D: 0.90, E: 0.85 };
  const GROUP_LABELS = { A: '+5%', B: 'sem ajuste', C: '−5%', D: '−10%', E: '−15%' };

  const groupSegElement = document.getElementById('groupSeg');
  const groupEffectElement = document.getElementById('groupEffect');

  // Estado: grupo selecionado e tarefas atualmente exibidas (para recalcular)
  let selectedGroup = getSelectedGroup();
  let currentTasks = [];

  // Inicialmente, esconder a lista de tarefas
  taskListContainerElement.style.display = 'none';
  messageElement.style.display = 'flex';
  reloadContainerElement.style.display = 'none';
  document.getElementById('averageContainer').style.display = 'block';
  document.getElementById('defaultGradeBtn').style.display = 'block';
  document.getElementById('clearGradesBtn').style.display = 'block';

  // Formatar número para 2 casas decimais
  function formatNumberTruncated(number) {
    return number.toFixed(2);
  }

  // Formatar peso: inteiro quando possível (ex.: 4), senão 1 casa (ex.: 2.5)
  function formatWeight(weight) {
    const w = Number(weight) || 0;
    return Number.isInteger(w) ? String(w) : w.toFixed(1);
  }

  // Grupo selecionado (default B). Persistido no localStorage do popup.
  function getSelectedGroup() {
    const g = localStorage.getItem(GROUP_KEY);
    return GROUP_FACTORS[g] ? g : 'B';
  }

  function saveSelectedGroup(group) {
    localStorage.setItem(GROUP_KEY, group);
  }

  // Marca visualmente o botão do grupo ativo
  function setActiveGroupButton(group) {
    groupSegElement.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.group === group);
    });
  }

  // Liga o seletor de grupo: ao trocar, salva e recalcula a média
  function initGroupSelector() {
    setActiveGroupButton(selectedGroup);
    groupSegElement.addEventListener('click', function(event) {
      const btn = event.target.closest('button[data-group]');
      if (!btn) return;
      selectedGroup = btn.dataset.group;
      saveSelectedGroup(selectedGroup);
      setActiveGroupButton(selectedGroup);
      calculateAndDisplayAverage(currentTasks);
    });
  }

  // Função para salvar grades no localStorage
  function saveGradesToLocalStorage(tasks) {
    const gradesData = {};

    tasks.forEach(task => {
      // Usar o nome da tarefa como chave para identificá-la
      if (task.name) {
        gradesData[task.name] = {
          grade: task.grade,
          originalGrade: task.originalGrade,
          manuallySet: task.manuallySet || false
        };
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(gradesData));
  }

  // Função para buscar notas do localStorage
  function getGradesFromLocalStorage() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    return storedData ? JSON.parse(storedData) : {};
  }

  // Carrega as notas capturadas em background pelo content script e exibe.
  function loadFromStorage() {
    chrome.storage.local.get(CAPTURED_KEY, function(result) {
      const captured = result[CAPTURED_KEY];

      if (!captured || !captured.tasks || captured.tasks.length === 0) {
        showNoData();
        return;
      }

      showTasks(captured.tasks);
    });
  }

  // Estado em que ainda não há notas capturadas: orienta o usuário.
  function showNoData() {
    messageElement.style.display = 'none';
    taskListContainerElement.style.display = 'none';
    reloadContainerElement.style.display = 'block';
    document.getElementById('averageContainer').style.display = 'none';
    document.getElementById('defaultGradeBtn').style.display = 'none';
    document.getElementById('clearGradesBtn').style.display = 'none';
  }

  // Recebe as tarefas capturadas, mescla com as notas manuais e renderiza.
  function showTasks(capturedTasks) {
    // Clonar para não mutar o objeto vindo do storage
    const tasks = capturedTasks.map(t => ({ ...t }));

    // Buscar notas salvas manualmente do localStorage
    const savedGrades = getGradesFromLocalStorage();

    tasks.forEach(task => {
      // Salvar a nota original da tabela
      task.originalGrade = task.grade;

      // Lógica de Prioridade: a nota oficial (da página) SEMPRE prevalece
      if (task.originalGrade !== null && task.originalGrade !== undefined) {
        task.manuallySet = false;
      } else {
        // Se NÃO existe nota oficial, verificamos se o usuário salvou algo
        if (savedGrades[task.name]) {
          task.grade = savedGrades[task.name].grade;
          task.manuallySet = savedGrades[task.name].manuallySet;
        }
      }
    });

    // Persistir o estado mesclado (corrige notas manuais antigas quando a
    // nota oficial passa a existir)
    saveGradesToLocalStorage(tasks);

    renderTasks(tasks);
    calculateAndDisplayAverage(tasks);

    // Mostrar lista de tarefas
    messageElement.style.display = 'none';
    reloadContainerElement.style.display = 'none';
    taskListContainerElement.style.display = 'block';
    document.getElementById('averageContainer').style.display = 'block';
    document.getElementById('defaultGradeBtn').style.display = 'block';
    document.getElementById('clearGradesBtn').style.display = 'block';
  }

  // Função para renderizar as tarefas
  function renderTasks(tasks) {
    // Salvar o elemento que tem foco atualmente para tentar restaurar (se possível)
    const activeElement = document.activeElement;
    const focusedIndex = activeElement && activeElement.classList.contains('grade-input') ? activeElement.dataset.index : null;

    taskListElement.innerHTML = '';

    // Agrupar mantendo o índice original (usado pelos inputs e pelo cálculo)
    const groups = {};
    tasks.forEach((task, index) => {
      const cat = task.category || 'Ponderada';
      (groups[cat] = groups[cat] || []).push({ task, index });
    });

    // Ordem e rótulos das categorias
    const order = ['Artefato', 'Ponderada', 'Prova'];
    const labels = { Artefato: 'Artefatos', Ponderada: 'Atividades Ponderadas', Prova: 'Prova' };

    order.forEach(cat => {
      const items = groups[cat];
      if (!items || items.length === 0) return;

      const totalWeight = items.reduce((sum, it) => sum + (it.task.weight || 0), 0);

      const section = document.createElement('div');
      section.className = 'group group-' + cat.toLowerCase();
      section.innerHTML = `
        <div class="group-header">
          <span class="group-title">${labels[cat]}</span>
          <span class="group-weight">peso total ${formatWeight(totalWeight)}</span>
        </div>
      `;

      items.forEach(({ task, index }) => {
        const statusClass = task.status.toLowerCase().replace(/ /g, '-');
        const hasOriginalGrade = task.originalGrade !== null && task.originalGrade !== undefined;

        const item = document.createElement('div');
        item.className = 'task-item';
        item.innerHTML = `
          <div class="task-top">
            <div class="task-name">${task.name}</div>
            <input type="number" class="grade-input"
              value="${task.grade !== null && task.grade !== undefined ? task.grade : ''}"
              placeholder="–"
              data-index="${index}"
              data-original="${hasOriginalGrade ? task.originalGrade : ''}"
              min="0" max="10" step="0.01"
              ${hasOriginalGrade ? 'readonly' : ''}>
          </div>
          <div class="task-meta">
            <span class="weight-badge">peso <b>${formatWeight(task.weight)}</b></span>
            ${task.week ? `<span class="week">${task.week}</span>` : ''}
            <span class="task-status status-${statusClass}">${task.status}</span>
          </div>
        `;
        section.appendChild(item);
      });

      taskListElement.appendChild(section);
    });

    // Adicionar event listeners para os inputs de nota
    document.querySelectorAll('.grade-input').forEach(input => {
      // Se havia um input focado e é este o índice, restaurar o foco
      if (focusedIndex && input.dataset.index === focusedIndex) {
        input.focus();
      }

      // Só adicionar event listener para inputs que não são readonly
      if (!input.hasAttribute('readonly')) {
        input.addEventListener('input', function() {
          const index = parseInt(this.dataset.index);
          const newGrade = this.value !== '' ? parseFloat(this.value) : null;

          tasks[index].grade = newGrade;
          tasks[index].manuallySet = true; // Marcar que esta nota foi definida manualmente

          calculateAndDisplayAverage(tasks);
          saveGradesToLocalStorage(tasks); // Salvar as alterações no localStorage
        });
      }
    });
  }

  // Calcular e exibir a média
  function calculateAndDisplayAverage(tasks) {
    currentTasks = tasks; // guardar para recalcular ao trocar de grupo

    let totalWeight = 0;       // soma dos pesos de TODAS as atividades
    let gradedWeight = 0;      // soma dos pesos das atividades com nota
    let weightedSum = 0;

    tasks.forEach(task => {
      totalWeight += task.weight;
      if (task.grade !== null && task.grade !== undefined) {
        gradedWeight += task.weight;
        weightedSum += task.grade * task.weight;
      }
    });

    const baseAverage = gradedWeight > 0 ? weightedSum / gradedWeight : 0;

    // Ajuste do grupo sobre a média final (limitado a 0–10)
    const factor = GROUP_FACTORS[selectedGroup] || 1;
    const finalAverage = Math.max(0, Math.min(10, baseAverage * factor));

    averageValueElement.textContent = formatNumberTruncated(finalAverage);

    // Rótulo do grupo ao lado de "Média final"
    groupEffectElement.textContent = `· Grupo ${selectedGroup} (${GROUP_LABELS[selectedGroup]})`;

    // Destaque dos pesos: quanto do total de pesos já foi avaliado
    const pct = totalWeight > 0 ? Math.round((gradedWeight / totalWeight) * 100) : 0;
    let sub = `${formatWeight(gradedWeight)} de ${formatWeight(totalWeight)} em pesos avaliados (${pct}%)`;
    // Quando há ajuste, mostrar a média base antes do ajuste
    if (factor !== 1) {
      sub = `base ${formatNumberTruncated(baseAverage)} → ${formatNumberTruncated(finalAverage)} · ${sub}`;
    }
    averageSubElement.textContent = sub;

    updateAverageColor(finalAverage);
  }

  // Função para atualizar a cor da média e a barra de progresso
  function updateAverageColor(average) {
    const color = average >= 7 ? 'var(--green)' : 'var(--red)';
    averageValueElement.style.color = color;
    if (averageBarElement) {
      averageBarElement.style.width = Math.max(0, Math.min(100, average * 10)) + '%';
      averageBarElement.style.background = color;
    }
  }

  // Event listener para o botão de atribuir nota 7
  defaultGradeBtnElement.addEventListener('click', function() {
    const taskItems = document.querySelectorAll('.task-item');

    taskItems.forEach((item) => {
      const input = item.querySelector('.grade-input');

      // Se o input estiver vazio (e editável), preencher com 7
      if (input && !input.hasAttribute('readonly') && input.value === '') {
        input.value = '7';

        // Disparar evento de input para atualizar os dados
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
      }
    });
  });

  // Event listener para o botão de limpar notas
  clearGradesBtnElement.addEventListener('click', function() {
    const taskItems = document.querySelectorAll('.task-item');

    taskItems.forEach((item) => {
      const input = item.querySelector('.grade-input');

      // Pular inputs readonly (que já têm nota na tabela)
      if (input && !input.hasAttribute('readonly')) {
        input.value = '';

        // Disparar evento de input para atualizar os dados
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
      }
    });
  });

  // Atualização ao vivo: se o content script capturar novas notas enquanto o
  // popup está aberto, recarrega automaticamente.
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes[CAPTURED_KEY]) {
      loadFromStorage();
    }
  });

  // Ligar o seletor de grupo (A–E) e carregar os dados capturados em background
  initGroupSelector();
  loadFromStorage();
});
