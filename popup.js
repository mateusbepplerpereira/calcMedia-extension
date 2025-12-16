document.addEventListener('DOMContentLoaded', function() {
  const messageElement = document.getElementById('message');
  const taskListElement = document.getElementById('taskList');
  const taskListContainerElement = document.getElementById('taskListContainer');
  const averageValueElement = document.getElementById('averageValue');
  const defaultGradeBtnElement = document.getElementById('defaultGradeBtn');
  const clearGradesBtnElement = document.getElementById('clearGradesBtn');
  const reloadContainerElement = document.getElementById('reloadContainer');
  
  // Storage key for localStorage
  const STORAGE_KEY = 'academicGradeExtension_grades';
  
  // Inicialmente, esconder a lista de tarefas
  taskListContainerElement.style.display = 'none';
  messageElement.style.display = 'flex';
  reloadContainerElement.style.display = 'none';
  document.getElementById('averageContainer').style.display = 'block';
  document.getElementById('defaultGradeBtn').style.display = 'block';
  document.getElementById('clearGradesBtn').style.display = 'block';
  
  // Formatar número para 2 casas decimais exatamente como no código de referência
  function formatNumberTruncated(number) {
    // Converter para string com exatamente 2 casas decimais, usando toFixed que arredonda
    // Isso corresponde ao método usado no código de referência
    return number.toFixed(2);
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
  
  // Função para buscar tarefas da página atual
  function fetchTasks() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Verificar se podemos usar chrome.scripting
      if (chrome.scripting && chrome.scripting.executeScript) {
        // Usar chrome.scripting para extensões MV3
        chrome.scripting.executeScript({
          target: {tabId: activeTab.id},
          function: extractTasksFromPage
        }).then(handleResults).catch(handleScriptingError);
      } else {
        // Usar chrome.tabs para extensões MV2
        chrome.tabs.executeScript(
          activeTab.id,
          {code: `(${extractTasksFromPage.toString()})();`},
          handleResults
        );
      }
    });
  }
  
  // Função para lidar com erros de scripting
  function handleScriptingError(error) {
    console.error("Erro de scripting:", error);
    showError("Não foi possível acessar a página. Certifique-se que você está em uma página do academic-life.");
  }
  
  // Função executada na página para extrair tarefas
  function extractTasksFromPage() {
    // Buscar a tabela na página
    const table = document.querySelector('table.table-grade');
    
    if (!table) {
      // Se não encontrou a tabela, tentar buscar de outras formas
      const possibleTablesWithGrades = document.querySelectorAll('table');
      let gradeTableFound = false;
      let foundTable = null;
      
      for (const possibleTable of possibleTablesWithGrades) {
        // Verificar se esta tabela contém células que parecem notas
        if (possibleTable.textContent.includes('Nota') || 
            possibleTable.textContent.includes('Peso') || 
            possibleTable.querySelector('th')?.textContent.includes('Atividade')) {
          gradeTableFound = true;
          foundTable = possibleTable;
          break;
        }
      }
      
      if (!gradeTableFound) {
        return { found: false };
      }
      
      // Se encontrou uma tabela alternativa, use-a
      if (foundTable) {
        const rows = foundTable.querySelectorAll('tbody tr');
        if (!rows || rows.length === 0) {
          return { found: false };
        }
        
        const tasks = extractTasksFromRows(rows);
        return { found: true, tasks };
      }
      
      return { found: false };
    }
    
    // Se chegou até aqui, a tabela foi encontrada
    const rows = table.querySelectorAll('tbody tr');
    const tasks = extractTasksFromRows(rows);
    
    return { found: true, tasks };
    
    // Função interna para extrair dados das linhas
    function extractTasksFromRows(rows) {
      const tasks = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return; // Pular linhas sem células suficientes
        
        const nameCell = cells[0];
        const weekCell = cells[1];
        const statusCell = cells[2];
        const weightCell = cells[3]; // Corrigido: peso está no índice 3, não no 1
        const gradeCell = cells[4];
        
        if (nameCell && weightCell && statusCell && gradeCell) {
          const name = nameCell.textContent.trim();
          const weight = parseFloat(weightCell.textContent.trim().replace(',', '.')) || 0;
          const status = statusCell.textContent.trim();
          const week = weekCell ? weekCell.textContent.trim() : '';
          const grade = gradeCell.textContent.trim() !== '-' ? 
            parseFloat(gradeCell.textContent.trim().replace(',', '.')) : null;
          
          tasks.push({
            name,
            weight,
            status,
            week,
            grade
          });
        }
      });
      
      return tasks;
    }
  }
  
  // Função para lidar com os resultados da extração
  function handleResults(results) {
    if (!results || results.length === 0 || !results[0]) {
      showError("Erro ao extrair tarefas da página.");
      return;
    }
    
    // Ajustar para compatibilidade com MV2 e MV3
    const data = results[0].result || results[0];
    
    if (!data) {
      showError("Erro ao extrair tarefas da página.");
      return;
    }
    
    if (!data.found) {
      // Tabela não encontrada, mostrar mensagem e botão de recarregar
      messageElement.style.display = 'none';
      taskListContainerElement.style.display = 'none';
      reloadContainerElement.style.display = 'block';
      document.getElementById('averageContainer').style.display = 'none';
      document.getElementById('defaultGradeBtn').style.display = 'none';
      document.getElementById('clearGradesBtn').style.display = 'none';
      return;
    }
    
    const tasks = data.tasks;
    
    if (!tasks || tasks.length === 0) {
      showError("Nenhuma tarefa encontrada na página.");
      return;
    }
    
    // Buscar notas salvas do localStorage
    const savedGrades = getGradesFromLocalStorage();
    
    // Atualizar as tarefas com as notas salvas
    tasks.forEach(task => {
      // Salvar a nota original da tabela
      task.originalGrade = task.grade;
      
      // Lógica de Prioridade: A nota oficial (da página) SEMPRE prevalece sobre o localStorage
      if (task.originalGrade !== null) {
        // Se existe nota oficial, usamos ela e desmarcamos o manuallySet
        task.manuallySet = false;
        // task.grade já vem preenchido corretamente da extração
      } else {
        // Se NÃO existe nota oficial, verificamos se o usuário salvou algo
        if (savedGrades[task.name]) {
          task.grade = savedGrades[task.name].grade;
          task.manuallySet = savedGrades[task.name].manuallySet;
        }
      }
    });

    // Salvar o estado atualizado no localStorage
    // Isso garante que se uma nota oficial saiu, o localStorage seja corrigido (removendo a nota manual antiga)
    saveGradesToLocalStorage(tasks);
    
    renderTasks(tasks);
    calculateAndDisplayAverage(tasks);
    
    // Esconder mensagem e mostrar lista de tarefas
    messageElement.style.display = 'none';
    taskListContainerElement.style.display = 'block';
  }
  
  // Função para mostrar mensagem de erro
  function showError(message) {
    messageElement.innerHTML = `<div class="alert alert-warning">${message}</div>`;
    messageElement.style.display = 'block';
  }
  
  // Função para renderizar as tarefas
  function renderTasks(tasks) {
    // Salvar o elemento que tem foco atualmente para tentar restaurar (se possível)
    const activeElement = document.activeElement;
    const focusedIndex = activeElement && activeElement.classList.contains('grade-input') ? activeElement.dataset.index : null;

    taskListElement.innerHTML = '';
    
    tasks.forEach((task, index) => {
      const taskElement = document.createElement('div');
      taskElement.className = 'task-item';
      
      const statusClass = task.status.toLowerCase().replace(' ', '-');
      
      // Verificar se a tarefa tem uma nota original (da tabela)
      const hasOriginalGrade = task.originalGrade !== null;
      
      // Criar classe adicional para o container do input, se for readonly
      const inputContainerClass = hasOriginalGrade ? 'grade-input-container locked' : 'grade-input-container';
      
      taskElement.innerHTML = `
        <div class="task-header">
          <div class="task-name">${task.name}</div>
          <div class="task-grade-container">
            <div class="${inputContainerClass}">
              <input type="number" class="grade-input" 
                value="${task.grade !== null ? task.grade : ''}" 
                placeholder="-" 
                data-index="${index}" 
                data-original="${task.originalGrade !== null ? task.originalGrade : ''}"
                min="0" max="10" step="0.01"
                ${hasOriginalGrade ? 'readonly' : ''}>
            </div>
          </div>
        </div>
        <div class="task-details">
          <div class="task-weight">Peso: ${task.weight}</div>
          <div class="task-status status-${statusClass}">${task.status}</div>
        </div>
      `;
      
      taskListElement.appendChild(taskElement);
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
    let totalWeight = 0;
    let weightedSum = 0;
    
    tasks.forEach(task => {
      if (task.grade !== null) {
        totalWeight += task.weight;
        weightedSum += task.grade * task.weight;
      }
    });
    
    const average = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Formatar a média para 2 casas decimais
    const formattedAverage = formatNumberTruncated(average);
    
    // Atualizar o texto da média
    averageValueElement.textContent = formattedAverage;
    
    // Atualizar a cor da média com base no valor
    updateAverageColor(parseFloat(formattedAverage));
  }
  
  // Função para atualizar a cor da média
  function updateAverageColor(average) {
    if (average >= 7) {
      // Acima da média - verde
      averageValueElement.style.color = '#28a745';
    } else {
      // Abaixo da média - vermelho
      averageValueElement.style.color = '#dc3545';
    }
  }
  
  // Event listener para o botão de atribuir nota 7
  defaultGradeBtnElement.addEventListener('click', function() {
    // Recuperar as tarefas originais, que já contêm os pesos corretos
    const taskItems = document.querySelectorAll('.task-item');
    let tasksChanged = false;
    
    // Iterar sobre cada item da tarefa
    taskItems.forEach((item, index) => {
      const input = item.querySelector('.grade-input');
      const taskName = item.querySelector('.task-name').textContent;
      const weightElement = item.querySelector('.task-weight');
      
      // Extrair o peso da tarefa
      let weight = 0;
      if (weightElement && weightElement.textContent) {
        // Extrai apenas o número do texto "Peso: X"
        const weightMatch = weightElement.textContent.match(/Peso:\s*(\d*\.?\d*)/);
        if (weightMatch && weightMatch[1]) {
          weight = parseFloat(weightMatch[1]) || 0;
        }
      }
      
      // Se o input estiver vazio, preencher com 7
      if (input && input.value === '') {
        input.value = '7';
        
        // Disparar evento de input para atualizar os dados
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        tasksChanged = true;
      }
    });
    
    // Se houve alterações, a média e o localStorage já foram atualizados pelos eventos de input
  });
  
  // Event listener para o botão de limpar notas
  clearGradesBtnElement.addEventListener('click', function() {
    // Recuperar as tarefas com os inputs na página
    const taskItems = document.querySelectorAll('.task-item');
    let tasksChanged = false;
    
    // Iterar sobre cada item da tarefa
    taskItems.forEach((item, index) => {
      const input = item.querySelector('.grade-input');
      
      // Pular inputs readonly (que já têm nota na tabela)
      if (input && !input.hasAttribute('readonly')) {
        input.value = '';
        
        // Disparar evento de input para atualizar os dados
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        tasksChanged = true;
      }
    });
  });
  
  // Iniciar o processo de busca de tarefas
  fetchTasks();

  // Atualização periódica a cada 5 minutos (300000 ms)
  setInterval(fetchTasks, 300000);
});
