document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements with null checks
    const fileInput = document.getElementById('cv');
    const fileNameDisplay = document.getElementById('file-name');
    const fileText = document.querySelector('.file-text');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const jobDescription = document.getElementById('jobDescription');
    
    // Validate required elements exist
    if (!fileInput || !fileNameDisplay || !fileText || !analyzeBtn || !jobDescription) {
        console.error('Required DOM elements not found');
        return;
    }

    // Add drag and drop functionality
    const fileLabel = document.querySelector('.file-label');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileLabel.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        fileLabel.addEventListener(eventName, () => {
            fileLabel.classList.add('highlight');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        fileLabel.addEventListener(eventName, () => {
            fileLabel.classList.remove('highlight');
        });
    });
    
    fileLabel.addEventListener('drop', handleDrop);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        fileInput.files = dt.files;
        updateFileName(file);
    }
    
    // Improved file input handling
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        updateFileName(file);
    });
    
    // Add file size validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function updateFileName(file) {
        if (file) {
            const extension = file.name.split('.').pop().toLowerCase();
            const validExtensions = ['pdf', 'doc', 'docx', 'txt'];
            
            if (!validExtensions.includes(extension)) {
                showError('Please upload a valid file type (PDF, DOC, DOCX, or TXT)');
                fileInput.value = '';
                return;
            }
            
            if (file.size > MAX_FILE_SIZE) {
                showError('File size exceeds 10MB limit');
                fileInput.value = '';
                return;
            }
            
            fileNameDisplay.textContent = file.name;
            fileNameDisplay.innerHTML += `<span class="file-size">(${formatFileSize(file.size)})</span>`;
            fileText.textContent = 'File selected';
            fileNameDisplay.style.color = 'var(--success-color)';
        } else {
            fileNameDisplay.textContent = '';
            fileText.textContent = 'Choose file';
        }
    }

    function formatAnalysis(text) {
        if (!text) return '';
        
        // Split into paragraphs and clean up
        const paragraphs = text.split('\n\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);
        
        // Format each paragraph
        const formattedParagraphs = paragraphs.map(para => {
            // Add proper indentation and spacing for bullet points
            if (para.startsWith('•')) {
                return para.replace(/^•\s*/, '• ');
            }
            return para;
        });
        
        // Join with proper spacing
        return formattedParagraphs.join('\n\n');
    }

    // Update the results update section with null checks
    function updateResults(data) {
        const elements = {
            scoreValue: document.getElementById('scoreValue'),
            atsScoreValue: document.getElementById('atsScoreValue'),
            matchingAnalysis: document.getElementById('matchingAnalysis'),
            atsRecommendation: document.getElementById('atsRecommendation'),
            description: document.getElementById('description'),
            recommendation: document.getElementById('recommendation'),
            loader: document.getElementById('loader'),
            results: document.getElementById('results')
        };

        // Validate all elements exist
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`Element ${key} not found`);
                return false;
            }
        }

        try {
            // Update scores with number validation
            elements.scoreValue.textContent = 
                Math.min(100, Math.max(0, parseInt(data.score) || 0));
            elements.atsScoreValue.textContent = 
                Math.min(100, Math.max(0, parseInt(data['ats-friendly']) || 0));
            
            // Update text content with formatting
            const sections = {
                matchingAnalysis: data.matching_analysis,
                atsRecommendation: data['ats-recommendation'],
                description: data.description,
                recommendation: data.recommendation
            };
            
            for (const [key, content] of Object.entries(sections)) {
                if (content && elements[key]) {
                    elements[key].innerHTML = formatAnalysis(content)
                        .replace(/\n\n/g, '<br><br>')
                        .replace(/•/g, '<span class="bullet">•</span>');
                }
            }
            
            // Hide loader and show results
            elements.loader.classList.add('hidden');
            elements.results.classList.remove('hidden');
            
            // Scroll to results
            elements.results.scrollIntoView({ behavior: 'smooth' });
            
            // Animate results appearance
            const resultSections = document.querySelectorAll('.result-section');
            resultSections.forEach((section, index) => {
                section.style.animationDelay = `${index * 0.1}s`;
            });

            return true;
        } catch (error) {
            console.error('Error updating results:', error);
            return false;
        }
    }

    // Add debounce function for performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Add retry mechanism for failed requests
    async function fetchWithRetry(url, options, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
    }

    // Enhance error display
    function showError(message, duration = 5000) {
        const existingError = document.querySelector('.error-message');
        if (existingError) existingError.remove();

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message shake';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
            <button class="close-error">×</button>
        `;
        
        const closeBtn = errorDiv.querySelector('.close-error');
        closeBtn.addEventListener('click', () => errorDiv.remove());

        document.querySelector('.input-section').appendChild(errorDiv);
        
        if (duration > 0) {
            setTimeout(() => {
                if (errorDiv.parentElement) {
                    errorDiv.classList.add('fade-out');
                    setTimeout(() => errorDiv.remove(), 300);
                }
            }, duration);
        }
    }

    // Add API key related elements
    const apiKeyInput = document.getElementById('apiKey');
    const togglePassword = document.querySelector('.toggle-password');
    
    // Toggle API key visibility
    togglePassword.addEventListener('click', () => {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' ? 
            '<i class="fas fa-eye"></i>' : 
            '<i class="fas fa-eye-slash"></i>';
    });

    // Update validateForm to include API key check
    function validateForm() {
        const file = fileInput.files[0];
        const jobDescriptionText = jobDescription.value.trim();
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showError('Please enter your Google API Key');
            apiKeyInput.classList.add('highlight');
            setTimeout(() => apiKeyInput.classList.remove('highlight'), 2000);
            return false;
        }
        
        if (!file) {
            showError('Please upload your CV/Resume');
            return false;
        }
        
        if (!jobDescriptionText) {
            showError('Please enter the job description');
            jobDescription.classList.add('highlight');
            setTimeout(() => jobDescription.classList.remove('highlight'), 2000);
            return false;
        }
        
        if (jobDescriptionText.length < 50) {
            showError('Please provide a more detailed job description');
            return false;
        }
        
        return true;
    }

    // Update the click handler to include API key
    analyzeBtn.addEventListener('click', async () => {
        if (!validateForm()) return;
        
        const file = fileInput.files[0];
        const jobDescriptionText = jobDescription.value;
        const apiKey = apiKeyInput.value;
        
        const loader = document.getElementById('loader');
        const results = document.getElementById('results');
        
        if (!loader || !results) {
            console.error('Loader or results elements not found');
            return;
        }

        loader.classList.remove('hidden');
        results.classList.add('hidden');
        
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        
        try {
            const formData = new FormData();
            formData.append('cv', file);
            formData.append('jobDescription', jobDescriptionText);
            formData.append('apiKey', apiKey);
            
            const response = await fetchWithRetry('/analyze', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            const updated = updateResults(data);
            
            if (!updated) {
                throw new Error('Failed to update results');
            }
            
        } catch (error) {
            console.error('Error:', error);
            showError(
                error.message === 'Failed to fetch' 
                    ? 'Network error. Please check your connection and try again.'
                    : error.message || 'An error occurred during analysis. Please try again.'
            );
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> Analyze CV';
        }
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            analyzeBtn.click();
        }
    });

    // Add auto-save feature for job description
    const saveJobDescription = debounce(() => {
        localStorage.setItem('savedJobDescription', jobDescription.value);
    }, 1000);

    jobDescription.addEventListener('input', saveJobDescription);

    // Restore saved job description
    const savedJobDescription = localStorage.getItem('savedJobDescription');
    if (savedJobDescription) {
        jobDescription.value = savedJobDescription;
    }

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'clear-btn';
    clearBtn.innerHTML = '<i class="fas fa-times"></i> Clear';
    clearBtn.onclick = () => {
        jobDescription.value = '';
        localStorage.removeItem('savedJobDescription');
    };

    // Add the clear button after the job description textarea
    jobDescription.parentNode.insertBefore(clearBtn, jobDescription.nextSibling);
}); 