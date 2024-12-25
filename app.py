from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
import json
import logging
from werkzeug.exceptions import RequestEntityTooLarge
import traceback
from PyPDF2 import PdfReader
from docx import Document
import io
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit

@app.errorhandler(413)
@app.errorhandler(RequestEntityTooLarge)
def too_large(e):
    return jsonify({'error': 'File size exceeds 10MB limit'}), 413

@app.errorhandler(500)
def internal_error(e):
    error_traceback = traceback.format_exc()
    logger.error(f"Internal server error: {str(e)}\nTraceback:\n{error_traceback}")
    return jsonify({'error': 'An internal server error occurred'}), 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        logger.info("Starting analysis request")
        
        # Validate file presence
        if 'cv' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        # Validate API key
        api_key = request.form.get('apiKey')
        if not api_key:
            return jsonify({'error': 'API key is required'}), 400
        
        # Validate job description
        job_description = request.form.get('jobDescription', '').strip()
        if not job_description or len(job_description) < 50:
            return jsonify({'error': 'Please provide a detailed job description'}), 400
            
        # Configure Gemini API with better error handling
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-pro')
        except Exception as e:
            logger.error(f"Failed to configure Gemini API: {str(e)}")
            return jsonify({'error': 'Invalid or expired API key'}), 400
            
        file = request.files['cv']
        
        # Enhanced file validation
        if not file.filename:
            return jsonify({'error': 'Invalid file'}), 400
            
        # Extract and validate text content
        try:
            cv_text = extract_text_from_file(file)
            if not cv_text or len(cv_text.strip()) < 100:
                return jsonify({'error': 'Could not extract sufficient text from file'}), 400
        except Exception as e:
            logger.error(f"Text extraction error: {str(e)}")
            return jsonify({'error': 'Error reading file content'}), 400
            
        # Analyze with retry mechanism
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = analyze_cv_job_match(cv_text, job_description, model)
                return jsonify(result)
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Analysis failed after {max_retries} attempts: {str(e)}")
                    raise
                logger.warning(f"Retry {attempt + 1}/{max_retries} after error: {str(e)}")
                time.sleep(2 ** attempt)  # Exponential backoff
                
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error(f"Error in analyze endpoint: {str(e)}\nTraceback:\n{error_traceback}")
        return jsonify({'error': 'An error occurred during analysis. Please try again.'}), 500

def extract_text_from_file(file):
    filename = file.filename.lower()
    
    try:
        if filename.endswith('.pdf'):
            # Handle PDF files
            pdf_reader = PdfReader(io.BytesIO(file.read()))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text
            
        elif filename.endswith('.docx'):
            # Handle DOCX files
            doc = Document(io.BytesIO(file.read()))
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
            
        elif filename.endswith('.txt'):
            # Handle TXT files
            return file.read().decode('utf-8')
            
        else:
            raise ValueError("Unsupported file format")
            
    except Exception as e:
        print(f"Error extracting text: {str(e)}")
        raise

def analyze_cv_job_match(cv_text, job_description, model):
    prompt = f"""
You are an expert CV/Resume Optimization Assistant. Analyze the following CV and job description:

CV Content:
{cv_text}

Job Description:
{job_description}

Core Functions:
1. Resume Analysis
   - Examine the structure, content, and formatting of submitted resumes
   - Identify missing critical components
   - Evaluate the effectiveness of existing content
   - Check for ATS (Applicant Tracking System) compatibility

2. Scoring System (100-point scale):
   - Format and Structure (20 points)
     * Professional layout: 5 points
     * Consistent formatting: 5 points
     * Clear section headers: 5 points
     * Appropriate length: 5 points
   
   - Content Quality (40 points)
     * Impact-driven accomplishments: 10 points
     * Relevant skills and qualifications: 10 points
     * Professional experience description: 10 points
     * Education and certifications: 10 points
   
   - Keywords and ATS Optimization (20 points)
     * Industry-specific keywords: 10 points
     * Job-relevant terminology: 10 points
   
   - Overall Effectiveness (20 points)
     * Personal branding: 5 points
     * Target role alignment: 5 points
     * Contact information completeness: 5 points
     * Error-free content: 5 points

3. Feedback Protocol:
   - Begin with an overall score breakdown
   - List missing critical components
   - Provide specific recommendations for improvement
   - Suggest additional sections or content when relevant
   - Highlight strengths to maintain
   - Offer industry-specific optimization tips

4. Essential Components to Check:
   - Contact Information
     * Full name
     * Professional email
     * Phone number
     * Location
     * LinkedIn profile (if applicable)
   
   - Professional Summary/Objective
     * Tailored to target role
     * Clear value proposition
   
   - Work Experience
     * Company names and locations
     * Employment dates
     * Quantifiable achievements
     * Action verbs
     * Relevant responsibilities
   
   - Education
     * Degree and major
     * Institution name
     * Graduation date
     * Relevant coursework (if applicable)
   
   - Skills
     * Technical skills
     * Soft skills
     * Language proficiencies
     * Certifications

Interaction Guidelines:
1. Always maintain a constructive and encouratsng tone
2. Provide specific examples for implementing suggestions
3. Focus on both immediate improvements and strategic enhancements
4. Consider the user's industry and career level when giving advice
5. Explain the reasoning behind major recommendations
6. Highlight the potential impact of suggested changes

Response Format:
1. Overall Score: [X/100]
2. Score Breakdown: [Detail points in each category]
3. Critical Missing Elements: [List with explanations]
4. Specific Recommendations: [Prioritized list with examples]
5. Strengths: [What's working well]
6. Additional Suggestions: [Industry-specific tips]
Analyze how ats Friendly/Optimized is the CV/Resume according to the job description.
Remember to:
- Be specific and actionable in feedback
- Consider both human readers and ATS systems
- Adapt recommendations to the user's career level and industry
- Provide examples when suggesting improvements
- Maintain a balance between professional standards and industry-specific requirements
    Analyze the match and provide output in the following JSON format:
    {{
        "matching_analysis": "Detailed analysis of strengths and gaps",
        "description": "Brief summary of CV",
        "score": "Numerical score 0-100",
        "recommendation": "Specific actions to improve match",
        "ats-friendly": "Numerical score 0-100",
        "ats-recommendation": "Specific keywords to be added to the CV/Resume to make it more ATS Friendly"
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        
        # Add safety checks for response parsing
        if not response or not response.text:
            raise ValueError("Empty response from AI model")
            
        # Clean the response text to ensure valid JSON
        cleaned_response = response.text.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:-3]  # Remove ```json and ``` markers
            
        result = json.loads(cleaned_response)
        
        # Validate required fields
        required_fields = ['matching_analysis', 'description', 'score', 'recommendation', 
                         'ats-friendly', 'ats-recommendation']
        for field in required_fields:
            if field not in result:
                result[field] = "Not available"
            if field in ['score', 'ats-friendly']:
                try:
                    result[field] = int(float(str(result[field]).replace('%', '')))
                except:
                    result[field] = 0
                    
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {str(e)}\nResponse text: {response.text}")
        return {
            "matching_analysis": "Error analyzing CV",
            "description": "Unable to process response",
            "score": 0,
            "recommendation": "Please try again",
            "ats-friendly": 0,
            "ats-recommendation": "Error during analysis"
        }
    except Exception as e:
        logger.error(f"Error in analyze_cv_job_match: {str(e)}")
        raise

def format_analysis_text(text):
    if not text:
        return ''
    
    # Split into paragraphs
    paragraphs = text.split('\n')
    
    # Format each paragraph
    formatted_paragraphs = []
    for para in paragraphs:
        para = para.strip()
        if para:
            # Convert dash lists to bullet points
            if para.startswith('- '):
                para = '• ' + para[2:]
            elif not para.startswith('• '):
                para = '• ' + para
            formatted_paragraphs.append(para)
    
    # Join with double newlines for better spacing
    return '\n\n'.join(formatted_paragraphs)

if __name__ == '__main__':
    app.run(debug=True, port=5000) 