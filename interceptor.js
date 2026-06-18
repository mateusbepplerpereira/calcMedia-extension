// Interceptador passivo (roda no contexto da própria página - world: MAIN).
//
// NÃO dispara nenhuma requisição. Apenas OBSERVA a resposta "userData" que a
// própria página do academic-life já busca a cada carregamento. Esse JSON traz
// todas as atividades (com peso e nota) sem precisar abrir a aba "Notas".
//
// Quando captura, repassa os dados para o content script via window.postMessage.

(function () {
  if (!location.href.includes('/academic-life')) return;

  const STATUS = { 1: 'A Fazer', 2: 'Fazendo', 3: 'Feito' };

  // Classifica a atividade. type 21 = Artefato, type 1 = Prova, type 11 =
  // Atividade Ponderada. O nome serve de reforço/fallback.
  function categorize(a) {
    const name = (a.caption || '').toLowerCase();
    if (a.type === 21 || name.includes('artefato')) return 'Artefato';
    if (a.type === 1 || name.includes('prova')) return 'Prova';
    return 'Ponderada';
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return parseFloat(String(v).replace(',', '.'));
  }

  // Um array é "de atividades da Adalove" se a maioria dos itens tiver os
  // campos caption + gradeResult + gradeWeight.
  function isActivitiesArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    let ok = 0;
    for (const it of arr) {
      if (it && typeof it === 'object' &&
          'caption' in it && 'gradeResult' in it && 'gradeWeight' in it) ok++;
    }
    return ok >= Math.ceil(arr.length / 2);
  }

  // Procura recursivamente o array de atividades dentro do JSON (normalmente
  // está em userData.activities, mas a busca evita depender da chave exata).
  function findActivities(root) {
    const seen = new Set();
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        if (isActivitiesArray(node)) return node;
        for (const v of node) if (v && typeof v === 'object') stack.push(v);
      } else {
        for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
      }
    }
    return null;
  }

  // Converte as atividades para o formato que o popup espera. Mantém apenas as
  // que contam para a média (peso > 0); nota "-1.0" vira null (não avaliada).
  function normalize(activities) {
    const tasks = [];
    for (const a of activities) {
      if (!a || typeof a !== 'object') continue;
      const name = (a.caption || '').toString().trim();
      if (!name) continue;
      const weight = toNumber(a.gradeWeight) || 0;
      if (weight <= 0) continue; // atividades sem peso não afetam a média
      const g = toNumber(a.gradeResult);
      const grade = (Number.isNaN(g) || g < 0) ? null : g;
      tasks.push({
        name,
        week: (a.folderCaption || '').toString().trim(),
        status: STATUS[a.status] || 'A Fazer',
        category: categorize(a),
        weight,
        grade,
      });
    }
    return tasks;
  }

  function handlePayload(url, text) {
    if (!text || text.length > 5_000_000) return;
    if (text.indexOf('gradeResult') === -1) return; // descarte rápido
    let json;
    try { json = JSON.parse(text); } catch { return; }

    const activities = findActivities(json);
    if (!activities) return;

    const tasks = normalize(activities);
    if (tasks.length === 0) return;

    console.log(`[Calculadora de Média] ${tasks.length} atividades com peso interceptadas de`, url);
    window.postMessage({ source: 'calcMedia', type: 'grades', url, tasks }, '*');
  }

  // --- Hook do fetch ---
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then((res) => {
        try {
          const url = (args[0] && args[0].url) || String(args[0] || '');
          res.clone().text().then((t) => handlePayload(url, t)).catch(() => {});
        } catch {}
      }).catch(() => {});
      return p;
    };
  }

  // --- Hook do XMLHttpRequest ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cm_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const type = this.responseType;
        if (type === '' || type === 'text' || type === 'json') {
          const text = type === 'json' ? JSON.stringify(this.response) : this.responseText;
          handlePayload(this.__cm_url, text);
        }
      } catch {}
    });
    return origSend.apply(this, arguments);
  };

  console.log('[Calculadora de Média] Interceptador passivo ativo no academic-life.');
})();
