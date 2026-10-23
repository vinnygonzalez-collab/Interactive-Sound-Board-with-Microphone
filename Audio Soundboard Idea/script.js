// 1. Press the Key Bindings to activate the audio sounds
const SOUNDS = [
    { id: 'kick', icon: '🥁', name: 'Kick Drum', key: 'a' },
    { id: 'snare', icon: '⚡', name: 'Snare', key: 's' },
    { id: 'synth', icon: '🎹', name: 'Synth Laser', key: 'd' },
    { id: 'ambient', icon: '🌌', name: 'Chime', key: 'f' }
];

let audioCtx = null;
let analyser = null;
let dataArray = [];
let bufferLength = 0;
let micSourceNode = null; // Keeps track of live microphone streaming source

const padElements = {}; 
const grid = document.getElementById('soundboard');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const welcomeScreen = document.getElementById('welcome-screen');
const studio = document.getElementById('studio');
const startButton = document.getElementById('get-started');

startButton.addEventListener('click', () => {
    welcomeScreen.hidden = true;
    studio.hidden = false;
});

// 2. Add an elegant Microphone UI Toggle Switch above the board programmatically
const controlsContainer = document.createElement('div');
controlsContainer.className = 'mic-controls';

const micBtn = document.createElement('button');
micBtn.type = 'button';
micBtn.className = 'mic-button';
micBtn.textContent = '🎙 Connect microphone';

micBtn.addEventListener('click', toggleMicrophone);
controlsContainer.appendChild(micBtn);
grid.parentNode.insertBefore(controlsContainer, grid);

function initAudio() {
    if (audioCtx) return; 
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    
    // Connect analyzer to speakers so you can still hear soundboard samples
    analyser.connect(audioCtx.destination);
    
    analyser.fftSize = 128; 
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    drawVisualizer();
}

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

// Generate the board elements
SOUNDS.forEach(sound => {
    const pad = document.createElement('button');
    pad.type = 'button';
    pad.classList.add('pad');
    pad.setAttribute('aria-label', `${sound.name}, keyboard shortcut ${sound.key.toUpperCase()}`);
    pad.innerHTML = `<span class="pad-icon" aria-hidden="true">${sound.icon}</span><span class="pad-name">${sound.name}</span><span class="pad-key">KEY / ${sound.key.toUpperCase()}</span>`;
    
    padElements[sound.key] = pad;
    pad.addEventListener('click', handlePadTrigger.bind(null, sound, pad));
    grid.appendChild(pad);
});

// Global Keyboard Bindings
window.addEventListener('keydown', async (event) => {
    const pressedKey = event.key.toLowerCase();
    if (padElements[pressedKey]) {
        const soundConfig = SOUNDS.find(s => s.key === pressedKey);
        handlePadTrigger(soundConfig, padElements[pressedKey]);
    }
});

async function handlePadTrigger(sound, padElement) {
    initAudio();
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    playSound(sound, padElement);
}

// 3. MICROPHONE INPUT CONNECTION MANAGEMENT
async function toggleMicrophone() {
    initAudio();
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    // If microphone stream is already alive, turn it off (Toggle feature)
    if (micSourceNode) {
        micSourceNode.mediaStream.getTracks().forEach(track => track.stop());
        micSourceNode.disconnect();
        micSourceNode = null;
        micBtn.textContent = '🎙 Connect microphone';
        micBtn.classList.remove('is-connected');
        return;
    }

    try {
        // Request hardware device permissions from browser
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Wrap your raw microphone stream data inside a Web Audio node
        micSourceNode = audioCtx.createMediaStreamSource(stream);
        
        // Connect the microphone to the visualizer analyser node
        // Crucial: We do NOT connect micSourceNode to audioCtx.destination to prevent a painful audio feedback loop!
        micSourceNode.connect(analyser);
        
        // Highlight button layout to signal it is actively recording
        micBtn.textContent = '■ Disconnect microphone';
        micBtn.classList.add('is-connected');
    } catch (err) {
        console.error("Microphone access denied or unavailable:", err);
        alert("Could not access microphone. Ensure you grant browser audio access permissions.");
    }
}

function playSound(sound, padElement) {
    padElement.classList.add('playing');
    setTimeout(() => padElement.classList.remove('playing'), 150);

    if (sound.id === 'snare') {
        playNoiseBurst();
        return;
    }

    const settings = {
        kick: { type: 'sine', start: 150, end: 45, duration: 0.35, volume: 0.8 },
        synth: { type: 'sawtooth', start: 880, end: 110, duration: 0.4, volume: 0.35 },
        ambient: { type: 'sine', start: 660, end: 660, duration: 0.8, volume: 0.25 }
    }[sound.id];
    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.start, now);
    if (settings.start !== settings.end) {
        oscillator.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
    oscillator.connect(gain);
    gain.connect(analyser);
    oscillator.start(now);
    oscillator.stop(now + settings.duration);
}

function playNoiseBurst() {
    const duration = 0.2;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1;
    }

    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(analyser);
    source.start(now);
}

// 4. Circular Radar Pulse Render Engine
function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    
    if (!analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    canvasCtx.fillStyle = '#05070f';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // OPTIONAL: Let the core circle dynamically pulse with the overall room volume!
    let totalVolume = 0;
    for(let i=0; i < bufferLength; i++) { totalVolume += dataArray[i]; }
    const averageVolume = totalVolume / bufferLength;
    
    // Scale central circle slightly using volume data
    const baseRadius = (Math.min(canvas.width, canvas.height) * 0.22) + (averageVolume * 0.15); 

    // Visual grid guidelines
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
    canvasCtx.lineWidth = 1;
    canvasCtx.stroke();

    for (let i = 0; i < bufferLength; i++) {
        const amplitude = dataArray[i];
        const angle = (i / bufferLength) * Math.PI * 2;
        
        // Sensitivity adjustments for mic waveforms
        const extraLength = amplitude * 0.5; 
        const totalRadius = baseRadius + extraLength;
        
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * totalRadius;
        const endY = centerY + Math.sin(angle) * totalRadius;
        
        const red = Math.floor(i * (255 / bufferLength));
        const purple = 255 - red;
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(startX, startY);
        canvasCtx.lineTo(endX, endY);
        
        canvasCtx.strokeStyle = `rgb(${red}, ${purple}, 255)`;
        canvasCtx.lineWidth = 4;
        canvasCtx.lineCap = 'round';
        
        canvasCtx.shadowBlur = amplitude > 0 ? 10 : 0;
        canvasCtx.shadowColor = `rgb(${red}, ${purple}, 255)`;
        
        canvasCtx.stroke();
    }
    
    canvasCtx.shadowBlur = 0;
}
