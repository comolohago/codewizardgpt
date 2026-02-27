// Protocolo EEP - Wizard JSON Edition (REFINEMENT MODE)
const EEP_PROTOCOL = `ENGINEERING EXECUTION PROTOCOL — LLM STRICT MODE (WIZARD JSON EDITION)

Execution is sequential and mandatory.
Do not skip phases.
Do not generate code before PHASE 3.
All explanatory output MUST be in Spanish.
Output MUST be a single valid JSON object.
No text is allowed outside the JSON.

JSON SCHEMA: {
    "status": "OK | INSUFFICIENT_INFORMATION",
    "missing_information": [ "string" ],
    "phases": [
        { "phase_id": "PHASE_1", "title": "PROBLEM MODELING", "steps": [ { "step_id": "1", "label": "string", "content": "string" } ] },
        { "phase_id": "PHASE_2", "title": "DESIGN", "steps": [ { "step_id": "5", "label": "string", "content": "string" } ] },
        { "phase_id": "PHASE_3", "title": "IMPLEMENTATION", "steps": [{ "step_id": "9", "label": "IMPLEMENTATION", "content": "FULL_CODE" }] },
        { "phase_id": "PHASE_4", "title": "VALIDATION", "steps": [ { "step_id": "10", "label": "string", "content": "string" } ] }
    ]
}

REFINEMENT MODE RULES:
1. If the user provides feedback, focus on updating "PHASE_3 - IMPLEMENTATION".
2. The "content" in PHASE_3 must always contain the FULL updated code.

CRITICAL ESCAPING:
- ESCAPE ALL DOUBLE QUOTES INSIDE CODE: Use \\\" (triple backslash).
- NO REAL NEWLINES: Use \\n literal.

GLOBAL RULES:
- No text outside JSON. No markdown.`;

document.addEventListener('DOMContentLoaded', () => {
  // Screens
  const inputScreen = document.getElementById('input-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const missingInfoScreen = document.getElementById('missing-info-screen');
  const resultScreen = document.getElementById('result-screen');

  // Inputs & Btns
  const promptInput = document.getElementById('prompt-input');
  const refineInput = document.getElementById('refine-input');
  const startBtn = document.getElementById('start-btn');
  const replyBtn = document.getElementById('reply-btn');
  const refineBtn = document.getElementById('refine-btn');
  const downloadLogsBtn = document.getElementById('download-logs-btn');

  // Containers
  const missingFormContainer = document.getElementById('missing-form-container');
  const phasesContainer = document.getElementById('phases-container');
  const statusText = document.getElementById('status-text');

  let fullPromptHistory = "";

  const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
    if (id === 'result-screen') phasesContainer.scrollTop = 0;
  };

  const updateStatus = (text, isError = false) => {
    statusText.textContent = text;
    statusText.style.color = isError ? "#f87171" : "#00d2ff";
  };

  const sendToContent = (action, data = {}) => {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].url.includes("chatgpt.com")) {
          return reject("Abre chatgpt.com para usar el Wizard");
        }
        chrome.tabs.sendMessage(tabs[0].id, { action, ...data }, (response) => {
          if (chrome.runtime.lastError) return reject("Refresca ChatGPT");
          resolve(response);
        });
      });
    });
  };

  const aggressiveSanitize = (badJson) => {
    if (!badJson) return "";
    let fixed = badJson;

    // 1. Corregir atributos mal escapados dentro de strings (ej: width="200" -> width=\"200\")
    fixed = fixed.replace(/(\w+)= "([^"]*)"/g, '$1=\\\"$2\\\"');

    // 2. Corregir saltos de línea reales dentro de valores (deben ser \n)
    fixed = fixed.replace(/"([^"]*)"/g, (match, p1) => {
      return '"' + p1.replace(/\n/g, "\\n").replace(/\r/g, "") + '"';
    });

    // 3. FIX CRÍTICO: Eliminar comillas dobles triples o dobles al final de un valor 
    // causado por el escape automático de la IA (ej: "content": "..."")
    fixed = fixed.replace(/"\s*"\s*([,}])/g, '"$1');

    return fixed;
  };

  const parseWizardResponse = (rawResponse) => {
    if (!rawResponse) throw new Error("Respuesta vacía del motor");
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Sin estructura JSON");
      const candidate = jsonMatch[0];
      try {
        return JSON.parse(candidate);
      } catch (firstError) {
        return JSON.parse(aggressiveSanitize(candidate));
      }
    } catch (e) {
      const unknownLogs = JSON.parse(localStorage.getItem('eep_unknown_logs') || '[]');
      unknownLogs.push({ date: new Date().toISOString(), content: rawResponse, error: e.message });
      localStorage.setItem('eep_unknown_logs', JSON.stringify(unknownLogs));
      throw new Error(`Error de sintaxis JSON. Log registrado.`);
    }
  };

  const processProtocol = async (userInput) => {
    showScreen('loading-screen');
    updateStatus("Analizando...");

    const finalPrompt = `${userInput}\n\n${EEP_PROTOCOL}`;

    try {
      const resp = await sendToContent("send_and_wait", { text: finalPrompt });
      if (resp.status === "success" && resp.response) {
        const data = parseWizardResponse(resp.response);
        handleStep(data);
      } else {
        throw new Error(resp.message || "Fallo en motor");
      }
    } catch (err) {
      updateStatus(err.message || err, true);
      setTimeout(() => {
        if (phasesContainer.innerHTML !== "") showScreen('result-screen');
        else showScreen('input-screen');
      }, 4000);
    }
  };

  const handleStep = (data) => {
    if (!data) return;
    if (data.status === "INSUFFICIENT_INFORMATION") {
      updateStatus("Falta información");
      renderMissingForm(data.missing_information || []);
      showScreen('missing-info-screen');
    } else if (data.status === "OK") {
      updateStatus("Completado");
      renderPhases(data.phases || []);
      showScreen('result-screen');
    }
  };

  const renderMissingForm = (items) => {
    missingFormContainer.innerHTML = "";
    items.forEach((item, index) => {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = `${index + 1}. ${item}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = "Respuesta...";
      input.className = "dynamic-missing-input";
      input.dataset.question = item;
      group.appendChild(label);
      group.appendChild(input);
      missingFormContainer.appendChild(group);
    });
  };

  const renderPhases = (phases) => {
    if (!Array.isArray(phases)) return;
    phasesContainer.innerHTML = phases.map(phase => {
      let phaseHtml = `<div class="phase-card"><h4>${phase.phase_id || ''}: ${phase.title || ''}</h4>`;
      if (Array.isArray(phase.steps)) {
        phaseHtml += phase.steps.map(step => {
          const content = step.content || "";
          if (step.label === "IMPLEMENTATION") {
            const cleanCode = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
            return `
              <div class="step-item">
                <strong>${step.label} (Vista Previa)</strong>
                <div class="preview-container">
                  <iframe class="preview-iframe" srcdoc="${cleanCode.replace(/"/g, '&quot;')}"></iframe>
                </div>
                <div class="code-block">${cleanCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              </div>`;
          } else {
            return `
              <div class="step-item">
                <strong>${step.label || ''}</strong>
                <div class="step-content">${content.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')}</div>
              </div>`;
          }
        }).join('');
      }
      phaseHtml += `</div>`;
      return phaseHtml;
    }).join('');
    phasesContainer.scrollTop = 0;
  };

  startBtn.addEventListener('click', () => {
    const val = promptInput.value.trim();
    if (val) {
      fullPromptHistory = `PROYECTO: ${val}`;
      processProtocol(val);
    }
  });

  replyBtn.addEventListener('click', () => {
    const inputs = document.querySelectorAll('.dynamic-missing-input');
    let answersCombined = "";
    let answeredCount = 0;
    inputs.forEach(input => {
      if (input.value.trim()) {
        answersCombined += `\n* ${input.dataset.question}: ${input.value.trim()}`;
        answeredCount++;
      }
    });
    if (answeredCount === 0) return updateStatus("Responde al menos un punto", true);
    fullPromptHistory += `\nRESPUESTAS:\n${answersCombined}`;
    processProtocol(fullPromptHistory);
  });

  refineBtn.addEventListener('click', () => {
    const val = refineInput.value.trim();
    if (val) {
      fullPromptHistory += `\nREFINAMIENTO: ${val}. Genera versión completa en PHASE_3.`;
      processProtocol(fullPromptHistory);
      refineInput.value = "";
    }
  });

  downloadLogsBtn.addEventListener('click', () => {
    const logs = localStorage.getItem('eep_unknown_logs');
    if (!logs || logs === "[]") return updateStatus("No hay logs", false);
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eep_errors_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
