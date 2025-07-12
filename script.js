let isWaitingForResponse = false;
let currentThinkingContainer = null;
let stepCounter = 0;
let hasUsedTools = false;
let editingMessage = null;
let allMessages = [];
let responseStartTime = null;
let toolsUsed = new Set(); // Track multiple tools used in one response

// Sidebar functionality
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// Copy functionality
function copyMessage(messageElement) {
    const content = messageElement.querySelector('.message-content').textContent;
    navigator.clipboard.writeText(content).then(() => {
        showCopyNotification();
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

function showCopyNotification() {
    const notification = document.getElementById('copyNotification');
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2000);
}

// Edit functionality - Fixed to properly clean up old thinking containers
function editMessage(messageElement) {
    if (editingMessage) {
        cancelEdit();
    }

    editingMessage = messageElement;
    const contentDiv = messageElement.querySelector('.message-content');
    const originalText = contentDiv.textContent;

    messageElement.classList.add('editing');
    contentDiv.innerHTML = `
        <textarea class="edit-input" id="editInput">${originalText}</textarea>
        <div class="edit-actions">
            <button class="edit-btn save" onclick="saveEdit()">Save</button>
            <button class="edit-btn cancel" onclick="cancelEdit()">Cancel</button>
        </div>
    `;

    const textarea = document.getElementById('editInput');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function saveEdit() {
    if (!editingMessage) return;

    const textarea = document.getElementById('editInput');
    const newText = textarea.value.trim();

    if (newText) {
        // Find the index of the edited message
        const messagesContainer = document.getElementById('messagesContainer');
        const allMessageElements = Array.from(messagesContainer.querySelectorAll('.message'));
        const editedMessageIndex = allMessageElements.indexOf(editingMessage);

        // Remove all messages AND thinking containers AFTER the edited message
        const allElements = Array.from(messagesContainer.children);
        const editedElementIndex = allElements.indexOf(editingMessage);

        // Remove everything after the edited message
        const elementsToRemove = allElements.slice(editedElementIndex + 1);
        elementsToRemove.forEach(element => {
            // Check if it's a thinking container or message
            if (element.classList.contains('thinking-container') || 
                element.classList.contains('message') || 
                element.classList.contains('welcome-screen')) {
                element.remove();
            }
        });

        // Reset thinking container reference
        currentThinkingContainer = null;

        // Update the message content
        editingMessage.classList.remove('editing');
        const contentDiv = editingMessage.querySelector('.message-content');
        contentDiv.textContent = newText;

        // Clear editing state
        editingMessage = null;

        // Hide welcome screen
        const welcomeScreen = document.getElementById('welcomeScreen');
        welcomeScreen.style.display = 'none';

        // Reset timer and send the edited message
        responseStartTime = null;
        streamResponse(newText);
    } else {
        cancelEdit();
    }
}

function cancelEdit() {
    if (!editingMessage) return;

    const contentDiv = editingMessage.querySelector('.message-content');
    const textarea = document.getElementById('editInput');
    const originalText = textarea.value;

    editingMessage.classList.remove('editing');
    contentDiv.textContent = originalText;
    editingMessage = null;
}

// Enhanced markdown parsing function
function parseMarkdown(text) {
    return text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\`\`\`(.*?)\`\`\`/gs, '<pre><code>$1</code></pre>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/^• (.*$)/gim, '<li>$1</li>')
        .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
}

function wrapListItems(html) {
    return html.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/gs, '<ul>$1</ul>');
}

function createTopicSuggestions(text) {
    const topicPattern = /\*([^*:]+):\*\*(.*?)(?=\*|$)/g;
    return text.replace(topicPattern, (match, title, description) => {
        return `<div class="topic-suggestion" onclick="sendQuickMessage('${title.trim()}')">
            <div class="topic-title">${title.trim()}</div>
            <div class="topic-description">${description.trim()}</div>
        </div>`;
    });
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200);
    textarea.style.height = newHeight + 'px';
}

function startNewChat() {
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeScreen = document.getElementById('welcomeScreen');

    fetch("http://localhost:5001/new_chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    })
    .then(res => res.json())
    .then(data => {
        console.log(data.status);
    })
    .catch(err => console.error("Error:", err));

    messagesContainer.innerHTML = '';
    messagesContainer.appendChild(welcomeScreen);
    welcomeScreen.style.display = 'flex';

    stepCounter = 0;
    hasUsedTools = false;
    allMessages = [];
    responseStartTime = null;
    currentThinkingContainer = null;
    toolsUsed.clear();
}

function sendQuickMessage(message) {
    document.getElementById('messageInput').value = message;
    sendMessage();
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message || isWaitingForResponse) return;

    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.display = 'none';

    // Start timer when user sends message
    responseStartTime = Date.now();

    // Add user message
    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Reset tool usage tracking
    hasUsedTools = false;
    toolsUsed.clear();

    // Start streaming response
    streamResponse(message);
}

function addMessage(content, sender, isHtml = false) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender} fade-in`;

    // Create message wrapper for better positioning
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (isHtml) {
        contentDiv.innerHTML = content;
    } else {
        contentDiv.textContent = content;
    }

    // Add message actions based on sender
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    if (sender === 'user') {
        // User messages get both copy and edit buttons
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="copyMessage(this.closest('.message'))" title="Copy">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/>
                </svg>
            </button>
            <button class="action-btn" onclick="editMessage(this.closest('.message'))" title="Edit">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" fill="none"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none"/>
                </svg>
            </button>
        `;
    } else {
        // AI messages get only copy button
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="copyMessage(this.closest('.message'))" title="Copy">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/>
                </svg>
            </button>
        `;
    }

    messageWrapper.appendChild(contentDiv);
    messageWrapper.appendChild(actionsDiv);
    messageDiv.appendChild(messageWrapper);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Store message in array
    allMessages.push({ content, sender, element: messageDiv });
}

function createThinkingContainer() {
    const messagesContainer = document.getElementById('messagesContainer');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-container fade-in';

    const thinkingWrapper = document.createElement('div');
    thinkingWrapper.className = 'thinking-wrapper';

    // Start with thinking animation by default
    thinkingWrapper.innerHTML = `
        <div class="thinking-header" onclick="toggleThinking(this)">
            <div class="thinking-header-left">
                <span class="thinking-loader"></span>
                <span class="analyzing-text">Thinking...</span>
            </div>
            <svg class="thinking-toggle" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="thinking-content">
            <div class="thinking-steps" id="thinkingSteps"></div>
        </div>
    `;

    thinkingDiv.appendChild(thinkingWrapper);
    messagesContainer.appendChild(thinkingDiv);
    scrollToBottom();

    stepCounter = 0;
    return thinkingDiv;
}

function toggleThinking(headerElement) {
    const wrapper = headerElement.parentElement;
    const content = wrapper.querySelector('.thinking-content');
    const toggle = wrapper.querySelector('.thinking-toggle');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
        toggle.classList.add('expanded');
    }
}

function addThinkingStep(type, data) {
    if (!currentThinkingContainer) return;

    const stepsContainer = currentThinkingContainer.querySelector('#thinkingSteps');
    const stepDiv = document.createElement('div');
    stepDiv.className = `thinking-step fast-fade-in`;

    if (data.tool_name !== "final_answer") {
        hasUsedTools = true;
        toolsUsed.add(data.tool_name);

        switch(type) {
            case 'tool-use':
                // Update header animation based on tool type
                if (data.tool_name === 'WebSearch') {
                    updateThinkingHeader('search');
                    stepDiv.innerHTML = `
                        <span class="step-label">Query:</span><span class="step-value">${data.tool_args.query}</span>
                    `;
                } else {
                    // For other tools, keep thinking animation but show tool usage
                    stepDiv.innerHTML = `
                        <span class="step-label">Using:</span><span class="step-value">${data.tool_name}</span>
                    `;
                }
                break;

            case 'tool-output':
                if (data.tool_name === 'WebSearch') {
                    // Parse the search results and display them nicely
                    try {
                        const results = JSON.parse(data.output);
                        if (Array.isArray(results) && results.length > 0) {
                            const searchResultsHtml = results.map(result => `
                                <div class="search-result">
                                    <div class="search-result-icon">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                                            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </div>
                                    <div class="search-result-content">
                                        <a href="${result.url}" target="_blank" class="search-result-title">${result.title}</a>
                                        <div class="search-result-url">${new URL(result.url).hostname}</div>
                                    </div>
                                </div>
                            `).join('');

                            stepDiv.innerHTML = `
                                <div style="margin-bottom: 8px;">
                                    <span class="step-label">Found ${results.length} sources:</span>
                                </div>
                                ${searchResultsHtml}
                            `;
                        } else {
                            stepDiv.innerHTML = `
                                <span class="step-label">Search:</span><span class="step-value">No results found</span>
                            `;
                        }
                    } catch (e) {
                        stepDiv.innerHTML = `
                            <span class="step-label">Search:</span><span class="step-value">Results received</span>
                        `;
                    }
                } else {
                    stepDiv.innerHTML = `
                        <span class="step-label">Result:</span><span class="step-value">${JSON.stringify(data.output).substring(0, 80)}</span>
                    `;
                }
                break;

            case 'reasoning':
                stepDiv.innerHTML = `
                    <span class="step-label">Thinking:</span><span class="step-value">${data.content.substring(0, 80)}...</span>
                `;
                break;
        }

        stepsContainer.appendChild(stepDiv);
        scrollToBottom();
    }
}

function updateThinkingHeader(type) {
    if (!currentThinkingContainer) return;

    const thinkingHeader = currentThinkingContainer.querySelector('.thinking-header-left');
    const loader = thinkingHeader.querySelector('.thinking-loader, .search-loader');
    const text = thinkingHeader.querySelector('.analyzing-text, .searching-text');

    if (type === 'search') {
        if (loader) {
            loader.className = 'search-loader';
        }
        if (text) {
            text.className = 'searching-text';
            text.textContent = 'Searching...';
        }
    } else {
        // Keep thinking animation for other tools
        if (loader) {
            loader.className = 'thinking-loader';
        }
        if (text) {
            text.className = 'analyzing-text';
            text.textContent = 'Thinking...';
        }
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function streamResponse(message) {
    isWaitingForResponse = true;
    document.getElementById('sendBtn').disabled = true;

    // Ensure timer starts fresh for each response
    if (!responseStartTime) {
        responseStartTime = Date.now();
    }

    const messagesContainer = document.getElementById('messagesContainer');
    let assistantMessageDiv = null;
    let assistantContentDiv = null;
    let responseText = '';

    function createAssistantMessage() {
        assistantMessageDiv = document.createElement('div');
        assistantMessageDiv.className = 'message assistant fade-in';

        // Create message wrapper
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'message-wrapper';

        assistantContentDiv = document.createElement('div');
        assistantContentDiv.className = 'message-content';

        // Add message actions for assistant messages
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="copyMessage(this.closest('.message'))" title="Copy">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/>
                </svg>
            </button>
        `;

        messageWrapper.appendChild(assistantContentDiv);
        messageWrapper.appendChild(actionsDiv);
        assistantMessageDiv.appendChild(messageWrapper);
        messagesContainer.appendChild(assistantMessageDiv);
        scrollToBottom();
    }

    // Streaming logic
    fetch('http://localhost:5001/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: message })
    })
    .then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function readStream() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    isWaitingForResponse = false;
                    document.getElementById('sendBtn').disabled = false;

                    // Calculate response time only if we have a valid start time
                    let seconds = 0;
                    if (responseStartTime) {
                        const responseEndTime = Date.now();
                        const responseTime = responseEndTime - responseStartTime;
                        seconds = (responseTime / 1000).toFixed(1);
                        responseStartTime = null; // Reset for next response
                    }

                    // Process final response with enhanced formatting
                    if (assistantContentDiv && responseText) {
                        let processedResponse = parseMarkdown(responseText);
                        processedResponse = wrapListItems(processedResponse);
                        processedResponse = createTopicSuggestions(processedResponse);

                        // Wrap in paragraphs if not already wrapped
                        if (!processedResponse.includes('<p>')) {
                            processedResponse = '<p>' + processedResponse + '</p>';
                        }

                        assistantContentDiv.innerHTML = processedResponse;

                        // Store assistant message
                        allMessages.push({ 
                            content: responseText, 
                            sender: 'assistant', 
                            element: assistantMessageDiv 
                        });
                    }

                    // Update thinking container with elapsed time
                    if (currentThinkingContainer && !hasUsedTools) {
                        currentThinkingContainer.remove();
                        currentThinkingContainer = null;
                    } else if (currentThinkingContainer) {
                        const thinkingHeader = currentThinkingContainer.querySelector('.analyzing-text, .searching-text');
                        const loader = currentThinkingContainer.querySelector('.thinking-loader, .search-loader');
                        
                        if (thinkingHeader && seconds > 0) {
                            // Create completion text based on tools used
                            let completionText = '';
                            if (toolsUsed.has('WebSearch') && toolsUsed.size > 1) {
                                completionText = `Used ${toolsUsed.size} tools in ${seconds}s`;
                            } else if (toolsUsed.has('WebSearch')) {
                                completionText = `Searched for ${seconds}s`;
                            } else {
                                completionText = `Thought for ${seconds}s`;
                            }
                            
                            thinkingHeader.textContent = completionText;
                            thinkingHeader.classList.remove('analyzing-text', 'searching-text');
                        }

                        if (loader) {
                            loader.style.display = 'none';
                        }
                    }

                    // Reset tool tracking
                    toolsUsed.clear();
                    return;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') return;

                        try {
                            const parsed = JSON.parse(data);
                            console.log(parsed);

                            switch(parsed.type) {
                                case 'tool_use':
                                    addThinkingStep('tool-use', parsed);
                                    break;

                                case 'thinking_start':
                                    currentThinkingContainer = createThinkingContainer();
                                    break;

                                case 'tool_output':
                                    addThinkingStep('tool-output', parsed);
                                    break;

                                case 'reasoning':
                                    addThinkingStep('reasoning', parsed);
                                    break;

                                case 'response_chunk':
                                    if (!assistantMessageDiv) {
                                        createAssistantMessage();
                                    }
                                    responseText += parsed.content;
                                    // Show raw text during streaming, format at the end
                                    assistantContentDiv.textContent = responseText;
                                    assistantContentDiv.classList.add('fast-fade-in');
                                    scrollToBottom();
                                    break;

                                case 'thinking_end':
                                    // Don't update here, wait for stream completion
                                    break;

                                case 'error':
                                    console.error('Error:', parsed.message);
                                    break;
                            }
                        } catch (e) {
                            console.error('Error parsing JSON:', e);
                        }
                    }
                });

                readStream();
            });
        }

        readStream();
    })
    .catch(error => {
        console.error('Error:', error);
        isWaitingForResponse = false;
        document.getElementById('sendBtn').disabled = false;
        addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
        responseStartTime = null; // Reset timer on error
        toolsUsed.clear();
    });
}