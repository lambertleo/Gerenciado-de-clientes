document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const configSection = document.getElementById('config-section');
    const appSection = document.getElementById('app-section');
    const configForm = document.getElementById('config-form');
    const addContactForm = document.getElementById('add-contact-form');
    const contactsList = document.getElementById('contacts-list');
    const downloadZipBtn = document.getElementById('download-zip-btn');

    // Elementos de feedback da UI
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const emptyMessage = document.getElementById('empty-message');

    // Elementos do Modal
    const confirmModal = document.getElementById('confirm-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');

    // Inputs de configuração
    const apiTokenInput = document.getElementById('api-token');
    const baseIdInput = document.getElementById('base-id');
    const tableNameInput = document.getElementById('table-name');

    // Variáveis de estado
    let apiConfig = {};
    let confirmCallback = null;

    // --- FUNÇÃO PARA BAIXAR O SITE ---
    const downloadSiteAsZip = async () => {
        if (typeof JSZip === 'undefined') {
            alert('A biblioteca de compressão (JSZip) não pôde ser carregada. Verifique a sua conexão à internet.');
            return;
        }

        try {
            const zip = new JSZip();

            // Pega o conteúdo HTML e CSS para adicionar ao zip
            const htmlContent = document.documentElement.outerHTML;
            const cssResponse = await fetch('style.css');
            const cssContent = await cssResponse.text();
            const jsResponse = await fetch('script.js');
            const jsContent = await jsResponse.text();

            // Adiciona os ficheiros ao zip
            zip.file("index.html", htmlContent);
            zip.file("style.css", cssContent);
            zip.file("script.js", jsContent);

            const content = await zip.generateAsync({ type: "blob" });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "gerenciador-de-clientes.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Erro ao criar o ficheiro ZIP:", error);
            alert("Ocorreu um erro ao tentar criar o ficheiro ZIP. Verifique a consola para mais detalhes.");
        }
    };
    downloadZipBtn.addEventListener('click', downloadSiteAsZip);


    // --- FUNÇÕES DE GESTÃO DA UI ---
    const showLoading = () => {
        hideMessages();
        loader.classList.remove('hidden');
    };
    const hideLoading = () => loader.classList.add('hidden');

    const showError = (message) => {
        hideLoading();
        contactsList.innerHTML = '';
        let friendlyMessage = `<strong>Ocorreu um erro inesperado:</strong><p class="mt-2">${message}</p>`;

        // Verifica se é o erro comum de permissão/configuração do Airtable
        if (message.toLowerCase().includes('invalid permissions') || message.toLowerCase().includes('not found')) {
            friendlyMessage = `
                <strong class="text-lg">Erro de Configuração ou Permissão</strong>
                <p class="mt-2 text-left">Não foi possível conectar à sua base de dados. Verifique os seguintes pontos:</p>
                <ul class="list-disc list-inside text-left mt-2 space-y-1">
                    <li><strong>Nome da Tabela:</strong> Está escrito exatamente como no Airtable (sensível a maiúsculas)?</li>
                    <li><strong>Permissões do Token:</strong> O seu token tem acesso a esta Base e permissões (scopes) para ler e escrever dados (data.records:read e data.records:write)?</li>
                    <li><strong>IDs Corretos:</strong> O "Base ID" está correto?</li>
                </ul>
                <button id="reset-config-btn" class="mt-4 btn-primary text-white font-bold py-2 px-4 rounded-lg">Alterar Configuração</button>
            `;
        }

        errorMessage.innerHTML = friendlyMessage;
        errorMessage.classList.remove('hidden');

        // Adiciona um listener ao novo botão, se ele existir
        const resetBtn = document.getElementById('reset-config-btn');
        if(resetBtn) {
            resetBtn.addEventListener('click', () => {
                sessionStorage.removeItem('apiConfig');
                appSection.classList.add('hidden');
                configSection.classList.remove('hidden');
                hideMessages();
            });
        }
    };

    const showEmptyState = () => {
        hideLoading();
        contactsList.innerHTML = '';
        emptyMessage.classList.remove('hidden');
    };

    const hideMessages = () => {
        errorMessage.classList.add('hidden');
        emptyMessage.classList.add('hidden');
        errorMessage.innerHTML = ''; // Limpa o conteúdo para evitar botões duplicados
    };

    // --- FUNÇÕES DO MODAL DE CONFIRMAÇÃO ---
    const showConfirmModal = (message, callback) => {
        modalMessage.textContent = message;
        confirmCallback = callback;
        confirmModal.classList.remove('hidden');
    };

    const hideConfirmModal = () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    };

    modalCancelBtn.addEventListener('click', hideConfirmModal);
    modalConfirmBtn.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        hideConfirmModal();
    });

    // --- FUNÇÕES DE CONFIGURAÇÃO ---

    // Carrega configuração do sessionStorage se existir
    const loadConfig = () => {
        const savedConfig = sessionStorage.getItem('apiConfig');
        if (savedConfig) {
            apiConfig = JSON.parse(savedConfig);
            apiTokenInput.value = apiConfig.token;
            baseIdInput.value = apiConfig.baseId;
            tableNameInput.value = apiConfig.tableName;
            configSection.classList.add('hidden');
            appSection.classList.remove('hidden');
            fetchContacts();
        }
    };

    // Guarda configuração e inicia a aplicação
    configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        apiConfig = {
            token: apiTokenInput.value.trim(),
            baseId: baseIdInput.value.trim(),
            tableName: tableNameInput.value.trim(),
        };

        if (!apiConfig.token || !apiConfig.baseId || !apiConfig.tableName) {
            showError("Por favor, preencha todos os campos de configuração.");
            return;
        }

        sessionStorage.setItem('apiConfig', JSON.stringify(apiConfig));
        configSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        fetchContacts();
    });


    // --- LÓGICA DA API (CRUD) ---

    // Função genérica para chamadas fetch
    const apiFetch = async (url, options = {}) => {
        const headers = {
            'Authorization': `Bearer ${apiConfig.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        };

        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }
            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error('API Fetch Error:', error);
            showError(error.message);
            throw error;
        }
    };

    // R - Read: Buscar clientes
    const fetchContacts = async () => {
        showLoading();
        const url = `https://api.airtable.com/v0/${apiConfig.baseId}/${encodeURIComponent(apiConfig.tableName)}`;

        try {
            const data = await apiFetch(url);
            hideLoading();
            if (data && data.records && data.records.length > 0) {
                renderContacts(data.records);
            } else {
                showEmptyState();
            }
        } catch (error) {
            // O erro já é tratado e exibido por apiFetch
        }
    };

    // C - Create: Adicionar novo cliente
    addContactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('contact-name').value;
        const email = document.getElementById('contact-email').value;
        const phone = document.getElementById('contact-phone').value;

        const url = `https://api.airtable.com/v0/${apiConfig.baseId}/${encodeURIComponent(apiConfig.tableName)}`;
        const body = {
            fields: {
                "Nome Completo": name,
                "E-mail": email,
                "Telefone": phone,
            }
        };

        try {
            await apiFetch(url, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            addContactForm.reset();
            fetchContacts();
        } catch (error) {
           // O erro já é tratado em apiFetch
        }
    });

    // D - Delete: Apagar um cliente
    const deleteContact = async (id) => {
        showConfirmModal('Tem a certeza de que deseja apagar este cliente?', async () => {
            const url = `https://api.airtable.com/v0/${apiConfig.baseId}/${encodeURIComponent(apiConfig.tableName)}/${id}`;
            try {
                await apiFetch(url, { method: 'DELETE' });
                fetchContacts();
            } catch (error) {
                // O erro já é tratado em apiFetch
            }
        });
    };


    // --- FUNÇÕES DE RENDERIZAÇÃO ---

    // Renderiza a lista de clientes no DOM
    const renderContacts = (records) => {
        hideMessages();
        contactsList.innerHTML = '';
        records.forEach(record => {
            const fields = record.fields;
            const name = fields["Nome Completo"] || 'Sem nome';
            const email = fields["E-mail"] || 'Sem email';
            const phone = fields.Telefone || 'Sem telefone';

            const card = document.createElement('div');
            card.className = 'card rounded-lg p-5 flex flex-col justify-between';
            card.innerHTML = `
                <div>
                    <h3 class="text-xl font-bold text-white">${name}</h3>
                    <p class="text-gray-400 mt-2"><i class="fas fa-envelope mr-2"></i>${email}</p>
                    <p class="text-gray-400 mt-1"><i class="fas fa-phone mr-2"></i>${phone}</p>
                </div>
                <button data-id="${record.id}" class="delete-btn mt-4 w-full btn-danger text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2">
                    <i class="fas fa-trash"></i> Apagar
                </button>
            `;
            contactsList.appendChild(card);
        });

        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                deleteContact(id);
            });
        });
    };

    // --- INICIALIZAÇÃO ---
    loadConfig();
});
