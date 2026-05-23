
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

const generateBtn = document.getElementById('generate-btn');
const themeToggle = document.getElementById('theme-toggle');
const numbersDisplay = document.querySelector('.numbers-display');
const toggleIcon = themeToggle.querySelector('.icon');

// Theme Management
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

function generateLottoNumbers() {
  const numbers = new Set();
  while (numbers.size < 6) {
    const randomNumber = Math.floor(Math.random() * 45) + 1;
    numbers.add(randomNumber);
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

generateBtn.addEventListener('click', () => {
  numbersDisplay.innerHTML = ''; // Clear previous numbers
  
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
      }, (i * 6 + index) * 60); // Faster stagger for 5 sets
    });
  }
});
