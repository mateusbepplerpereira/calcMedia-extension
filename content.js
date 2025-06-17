// Função que será executada quando a página for carregada
function init() {
  console.log("[Extensor de Tarefas] Script de conteúdo carregado na URL:", window.location.href);
  
  // Escutar mensagens do popup
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      console.log("[Extensor de Tarefas] Mensagem recebida:", request);
      
      if (request.action === "getTasks") {
        // Extrair tarefas da tabela na página
        const tasks = extractTasksFromPage();
        console.log("[Extensor de Tarefas] Enviando resposta:", tasks);
        sendResponse({tasks: tasks});
      }
      
      // Importante: retornar true para indicar que a resposta será assíncrona
      return true;
    }
  );
}

// Função para extrair tarefas da tabela na página
function extractTasksFromPage() {
  try {
    console.log("[Extensor de Tarefas] Extraindo tarefas da página");
    console.log("[Extensor de Tarefas] URL atual:", window.location.href);
    
    // Verificar se estamos na página correta
    if (!window.location.href.includes('/academic-life')) {
      console.log("[Extensor de Tarefas] Não estamos na página de tarefas acadêmicas");
      return null;
    }
    
    // Usar o XPath específico fornecido para encontrar a tabela
    let table = null;
    
    // Opção 1: Usar o XPath fornecido
    const xpath = '//*[@id="default-layout"]/div[2]/div/div[4]/div/div[2]/div/table';
    const xpathResult = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    table = xpathResult.singleNodeValue;
    
    console.log("[Extensor de Tarefas] Tabela encontrada via XPath:", table ? "Sim" : "Não");
    
    // Opção 2: Se o XPath não funcionar, tenta um seletor CSS mais simples
    if (!table) {
      console.log("[Extensor de Tarefas] Tentando método alternativo para encontrar a tabela");
      table = document.querySelector('#default-layout table');
    }
    
    if (!table) {
      console.error("[Extensor de Tarefas] Tabela de tarefas não encontrada");
      return null;
    }
    
    // Log da estrutura da tabela para depuração
    console.log("[Extensor de Tarefas] Estrutura da tabela encontrada:", table.outerHTML);
    
    // Array para armazenar as tarefas
    const tasks = [];
    
    // Tentar extrair o cabeçalho da tabela para entender a estrutura
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
    console.log("[Extensor de Tarefas] Cabeçalhos da tabela:", headers);
    
    // Obter todas as linhas da tabela (exceto cabeçalho)
    let rows = Array.from(table.querySelectorAll('tbody tr'));
    
    // Se não houver tbody, pegar todas as tr e ignorar a primeira (cabeçalho)
    if (rows.length === 0) {
      rows = Array.from(table.querySelectorAll('tr')).slice(1);
    }
    
    console.log("[Extensor de Tarefas] Linhas encontradas:", rows.length);
    
    // Extrair dados de cada linha
    rows.forEach((row, index) => {
      // Obter células da linha
      const cells = row.querySelectorAll('td');
      console.log(`[Extensor de Tarefas] Linha ${index+1} tem ${cells.length} células`);
      
      if (cells.length === 0) {
        console.log(`[Extensor de Tarefas] Linha ${index+1} não tem células td, pulando.`);
        return; // Continua para a próxima iteração
      }
      
      // Extrair informações com base na quantidade de células e nos cabeçalhos
      let nome = '';
      let semana = '';
      let status = 'A Fazer';
      let peso = 1; // Valor padrão para o peso
      let nota = '';
      
      // Para fins de depuração, vamos ver o conteúdo de cada célula
      Array.from(cells).forEach((cell, cellIndex) => {
        console.log(`[Extensor de Tarefas] Linha ${index+1}, Célula ${cellIndex+1}: "${cell.textContent.trim()}"`);
      });
      
      // Extração de dados conforme a estrutura informada:
      // [0] -> titulo atividade
      // [1] -> semana da atividade
      // [2] -> status, Feito, Fazendo e A fazer
      // [3] -> Numerico com o peso da nota
      // [4] -> Nota
      
      if (cells.length >= 1) {
        nome = cells[0].textContent.trim();
      }
      
      if (cells.length >= 2) {
        semana = cells[1].textContent.trim();
      }
      
      if (cells.length >= 3) {
        status = cells[2].textContent.trim();
        // Normalizar o status para um dos três valores padrão
        const statusLower = status.toLowerCase();
        if (statusLower.includes('feito') || statusLower.includes('concluído') || statusLower.includes('concluido')) {
          status = 'Feito';
        } else if (statusLower.includes('fazendo') || statusLower.includes('em andamento') || statusLower.includes('progresso')) {
          status = 'Fazendo';
        } else {
          status = 'A Fazer';
        }
      }
      
      if (cells.length >= 4) {
        const pesoText = cells[3].textContent.trim();
        // Extrair apenas números do texto do peso
        const pesoMatch = pesoText.match(/\d+(\.\d+)?/);
        if (pesoMatch) {
          peso = parseFloat(pesoMatch[0]) || 1;
        }
      }
      
      if (cells.length >= 5) {
        nota = cells[4].textContent.trim();
        // Tentar extrair valor numérico da nota, caso ela tenha formato não-padrão
        const notaMatch = nota.match(/\d+(\.\d+)?/);
        if (notaMatch) {
          nota = notaMatch[0];
        }
      }
      
      console.log(`[Extensor de Tarefas] Tarefa extraída - Nome: "${nome}", Semana: "${semana}", Status: "${status}", Peso: ${peso}, Nota: "${nota}"`);
      
      // Só adiciona se tiver pelo menos um nome
      if (nome) {
        tasks.push({
          nome: nome,
          semana: semana,
          status: status,
          peso: peso,
          nota: nota
        });
      }
    });
    
    console.log("[Extensor de Tarefas] Total de tarefas extraídas:", tasks.length);
    console.log("[Extensor de Tarefas] Tarefas:", tasks);
    
    return tasks;
    
  } catch (error) {
    console.error("[Extensor de Tarefas] Erro ao extrair tarefas:", error);
    return null;
  }
}

// Inicializar o script
init();
