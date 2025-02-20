document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const imageInput = document.getElementById('image-input');
    const uploadButton = document.getElementById('upload-button');
    const newChatButton = document.getElementById('new-chat-button');
    let isProcessing = false;
    let currentImageUrl = null;

    // Handle image upload button click
    uploadButton.addEventListener('click', () => {
        imageInput.click();
    });

    // Handle image selection
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Remove existing image preview if any
        removeImagePreview();

        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload image');
            }

            const data = await response.json();
            currentImageUrl = data.path;

            // Create image preview
            const previewContainer = document.createElement('div');
            previewContainer.className = 'image-preview-container';
            previewContainer.innerHTML = `
                <img src="${currentImageUrl}" class="image-preview" alt="Uploaded image">
                <button class="remove-image" title="Remove image">×</button>
            `;

            // Insert preview before the input container
            const inputContainer = document.querySelector('.input-container');
            chatForm.insertBefore(previewContainer, inputContainer);

            // Handle remove button click
            const removeButton = previewContainer.querySelector('.remove-image');
            removeButton.addEventListener('click', removeImagePreview);

        } catch (error) {
            addErrorMessage('Failed to upload image. Please try again.');
            console.error('Error:', error);
        }

        // Clear the input
        imageInput.value = '';
    });

    // Function to remove image preview
    function removeImagePreview() {
        const existingPreview = chatForm.querySelector('.image-preview-container');
        if (existingPreview) {
            existingPreview.remove();
        }
        currentImageUrl = null;
    }

    // Auto-resize textarea as user types
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
    });

    // Handle form submission
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if ((!message && !currentImageUrl) || isProcessing) return;

        isProcessing = true;
        
        // Add user message with image if present
        const userMessageContent = currentImageUrl 
            ? `<div>${message}</div><img src="${currentImageUrl}" alt="Uploaded image">`
            : message;
        addMessage(userMessageContent, 'user');
        userInput.value = '';
        userInput.style.height = 'auto';

        // Add loading message
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant-message loading';
        loadingDiv.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message,
                    imageUrl: currentImageUrl
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw {
                    response: {
                        data: data
                    }
                };
            }
            loadingDiv.remove();
            addMessage(data.reply, 'assistant');

            // Clear image after successful submission
            removeImagePreview();

        } catch (error) {
            loadingDiv.remove();
            const errorMessage = error.response?.data?.error || 'An error occurred while processing your request. Please try again.';
            const errorDetails = error.response?.data?.details;
            addErrorMessage(errorMessage, errorDetails);
            console.error('Error:', error);
        }

        isProcessing = false;
    });

    // Add message to chat
    function addMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        // Convert URLs to clickable links and preserve line breaks
        const formattedContent = content
            .replace(/\n/g, '<br>')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        messageDiv.innerHTML = formattedContent;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Add error message
    function addErrorMessage(message, details) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        
        const messageP = document.createElement('p');
        messageP.textContent = message;
        errorDiv.appendChild(messageP);

        if (details) {
            const detailsP = document.createElement('p');
            detailsP.className = 'error-details';
            detailsP.style.fontSize = '0.9em';
            detailsP.style.marginTop = '8px';
            detailsP.style.opacity = '0.8';
            detailsP.textContent = details;
            errorDiv.appendChild(detailsP);
        }

        chatMessages.appendChild(errorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Handle new chat button click
    newChatButton.addEventListener('click', () => {
        // Clear chat messages except welcome message
        while (chatMessages.lastChild) {
            chatMessages.removeChild(chatMessages.lastChild);
        }
        // Add welcome message back
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        welcomeMessage.innerHTML = '<p>👋 Hello! How can I help you today?</p>';
        chatMessages.appendChild(welcomeMessage);
        
        // Clear any existing image preview
        removeImagePreview();
        
        // Clear input
        userInput.value = '';
        userInput.style.height = 'auto';
        
        // Focus on input
        userInput.focus();
    });

    // Handle Enter to submit, Ctrl+Enter for new line
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.ctrlKey || e.metaKey) {
                // Allow new line with Ctrl+Enter
                return;
            } else {
                // Submit form with Enter
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });
});
