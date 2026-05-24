
class LottoBall extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const number = this.getAttribute('number');
    const numValue = parseInt(number, 10);

    let colorClass = '';
    if (numValue <= 10) {
      colorClass = 'color-1';
    } else if (numValue <= 20) {
      colorClass = 'color-2';
    } else if (numValue <= 30) {
      colorClass = 'color-3';
    } else if (numValue <= 40) {
      colorClass = 'color-4';
    } else {
      colorClass = 'color-5';
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          animation: appear 0.5s ease-out forwards;
          transform: scale(0);
        }

        .ball {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          color: var(--ball-text-color, #ffffff);
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 1.5rem;
          font-weight: bold;
          box-shadow: inset 0 -5px 10px rgba(0,0,0,0.2), 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .color-1 { background: #fbc400; } /* Yellow */
        .color-2 { background: #69c8f2; } /* Blue */
        .color-3 { background: #ff7272; } /* Red */
        .color-4 { background: #aaaaaa; } /* Gray */
        .color-5 { background: #b0d840; } /* Green */

        @keyframes appear {
          to {
            transform: scale(1);
          }
        }

        @media (max-width: 480px) {
          .ball {
            width: 45px;
            height: 45px;
            font-size: 1.1rem;
          }
        }
      </style>
      <div class="ball ${colorClass}">
        ${number}
      </div>
    `;
  }
}

customElements.define('lotto-ball', LottoBall);

// Existing elements
const generateBtn = document.getElementById('generate-btn');
const themeToggle = document.getElementById('theme-toggle');
const numbersDisplay = document.querySelector('.numbers-display');
const toggleIcon = themeToggle.querySelector('.icon');

// --- Theme Management ---
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateToggleIcon(savedTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateToggleIcon(newTheme);
});

function updateToggleIcon(theme) {
  toggleIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// --- Lotto Logic ---
function generateLottoNumbers() {
  const numbers = new Set();
  while (numbers.size < 6) {
    const randomNumber = Math.floor(Math.random() * 45) + 1;
    numbers.add(randomNumber);
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

generateBtn.addEventListener('click', () => {
  numbersDisplay.innerHTML = ''; 
  for (let i = 0; i < 5; i++) {
    const setRow = document.createElement('div');
    setRow.className = 'set-row';
    numbersDisplay.appendChild(setRow);
    const lottoNumbers = generateLottoNumbers();
    lottoNumbers.forEach((number, index) => {
      setTimeout(() => {
        const lottoBall = document.createElement('lotto-ball');
        lottoBall.setAttribute('number', number);
        setRow.appendChild(lottoBall);
      }, (i * 6 + index) * 60);
    });
  }
});

// --- Teachable Machine Logic ---
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/KOUnj9hm5/";
let model, webcam, labelContainer, maxPredictions;
let isWebcamRunning = false;

const startWebcamBtn = document.getElementById('start-webcam-btn');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const webcamContainer = document.getElementById('webcam-container');
const labelsDiv = document.getElementById('label-container');

async function initModel() {
    const modelURL = MODEL_URL + "model.json";
    const metadataURL = MODEL_URL + "metadata.json";
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    
    labelsDiv.innerHTML = '';
    for (let i = 0; i < maxPredictions; i++) {
        const item = document.createElement('div');
        item.className = 'prediction-item';
        item.innerHTML = `
            <div class="label-text"></div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill"></div>
            </div>
        `;
        labelsDiv.appendChild(item);
    }
}

async function startWebcam() {
    if (isWebcamRunning) return;
    if (!model) await initModel();
    
    const flip = true;
    webcam = new tmImage.Webcam(300, 300, flip);
    await webcam.setup();
    await webcam.play();
    isWebcamRunning = true;
    
    imagePreview.style.display = 'none';
    webcamContainer.style.display = 'block';
    webcamContainer.innerHTML = ''; // Clear any previous canvas
    webcamContainer.appendChild(webcam.canvas);
    
    startWebcamBtn.textContent = "웹캠 작동 중...";
    startWebcamBtn.disabled = true;
    
    window.requestAnimationFrame(loop);
}

async function loop() {
    if (!isWebcamRunning) return;
    webcam.update();
    await predict(webcam.canvas);
    window.requestAnimationFrame(loop);
}

async function predict(inputElement) {
    const prediction = await model.predict(inputElement);
    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i].className;
        const probability = prediction[i].probability.toFixed(2);
        const item = labelsDiv.childNodes[i];
        item.querySelector('.label-text').textContent = `${classPrediction}: ${(probability * 100).toFixed(0)}%`;
        item.querySelector('.progress-bar-fill').style.width = `${probability * 100}%`;
    }
}

if (startWebcamBtn) startWebcamBtn.addEventListener('click', startWebcam);

if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (isWebcamRunning) {
            isWebcamRunning = false;
            webcam.stop();
            webcamContainer.innerHTML = '';
            startWebcamBtn.textContent = "웹캠 시작";
            startWebcamBtn.disabled = false;
        }

        if (!model) await initModel();

        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreview.style.display = 'block';
            webcamContainer.style.display = 'none';
            imagePreview.onload = async () => {
                await predict(imagePreview);
            };
        };
        reader.readAsDataURL(file);
    });
}

// Initial model load
initModel();

// --- Contact Form AJAX Handling ---
const contactForm = document.getElementById('contact-form');
const formStatus = document.getElementById('form-status');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const response = await fetch(e.target.action, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        formStatus.textContent = '문의가 성공적으로 전송되었습니다. 감사합니다!';
        formStatus.className = 'success';
        contactForm.reset();
      } else {
        const result = await response.json();
        formStatus.textContent = result.errors ? result.errors.map(error => error.message).join(", ") : '오류가 발생했습니다.';
        formStatus.className = 'error';
      }
    } catch (error) {
      formStatus.textContent = '오류가 발생했습니다.';
      formStatus.className = 'error';
    }
  });
}
