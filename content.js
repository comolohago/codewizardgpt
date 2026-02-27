// Esperamos a que la librería chatgpt.js esté lista
(async () => {
    console.log('🤖 chatgpt.js: Iniciando content script (Fix Send)...');

    await chatgpt.isLoaded();

    async function getFinalResponse(promptText) {
        try {
            // 1. Verificamos que el chatbox exista
            const chatBox = chatgpt.getChatBox();
            if (!chatBox) {
                throw new Error("No se encontró el cuadro de texto de ChatGPT. ¿Estás logueado?");
            }

            console.log('🤖 chatgpt.js: Enviando prompt...');
            // Usamos 'click' para asegurar que el envío sea más directo si el Enter falla
            chatgpt.send(promptText, 'click');

            // 2. Esperar un momento a que ChatGPT procese el envío y aparezca el botón de Stop
            // Si no esperamos, isIdle() puede retornar inmediatamente si aún no ve el botón de Stop.
            await new Promise(r => setTimeout(r, 1500));

            console.log('🤖 chatgpt.js: Esperando a que termine de responder...');
            // isIdle espera a que la generación termine (cuando el botón stop desaparece)
            await chatgpt.isIdle();

            // 3. Pausa final de asentamiento del DOM
            await new Promise(r => setTimeout(r, 1000));

            // 4. Obtención de respuesta robusta
            const assistantMessages = document.querySelectorAll('div[data-message-author-role=assistant]');
            if (assistantMessages.length > 0) {
                return chatgpt.response.getFromDOM('last');
            } else {
                console.log('🤖 chatgpt.js: Intentando recuperación vía API...');
                return await chatgpt.getLastResponse();
            }
        } catch (e) {
            console.error('Error en getFinalResponse:', e);
            throw e;
        }
    }

    // Escuchar mensajes desde el popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "get_chat_info") {
            try {
                const assistantMessages = document.querySelectorAll('div[data-message-author-role=assistant]');
                const lastResponse = assistantMessages.length > 0 ? chatgpt.response.getFromDOM('last') : "No hay mensajes.";
                sendResponse({ status: "success", lastResponse: lastResponse });
            } catch (e) {
                sendResponse({ status: "error", message: e.message });
            }
            return true;
        }

        if (request.action === "send_and_wait") {
            getFinalResponse(request.text)
                .then(finalResponse => {
                    sendResponse({ status: "success", response: finalResponse });
                })
                .catch(err => {
                    console.error('Error en send_and_wait:', err);
                    sendResponse({ status: "error", message: err.message });
                });
            return true;
        }
    });
})();
