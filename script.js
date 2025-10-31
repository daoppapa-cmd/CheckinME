// នាំចូល Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    updateDoc,
    collection,
    onSnapshot,
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Variables ---
let db, auth;
let allEmployees = [];
let globalAttendanceList = [];
let currentUser = null;
let currentUserShift = null;
let attendanceCollectionRef = null;
let attendanceListener = null;
let currentConfirmCallback = null;

// --- AI & Camera Global Variables ---
let modelsLoaded = false;
let currentUserFaceMatcher = null;
let currentScanAction = null; // 'checkIn' or 'checkOut'
let videoStream = null;
const FACE_MATCH_THRESHOLD = 0.5;

// --- Google Sheet Configuration ---
const SHEET_ID = '1eRyPoifzyvB4oBmruNyXcoKMKPRqjk6xDD6-bPNW6pc';
const SHEET_NAME = 'DIList';

// *** កែប្រែទី ១: ប្តូរ Range ពី AI ទៅ AJ ***
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}&range=E9:AJ`; // <-- បានប្តូរទៅ AJ

// *** កែប្រែទី ២: ប្តូរ Index របស់ PHOTO ***
const COL_INDEX = {
    ID: 0,    // E: អត្តលេខ
    GROUP: 2,   // G: ក្រុម
    NAME: 7,    // L: ឈ្មោះ
    GENDER: 9,  // N: ភេទ
    GRADE: 13,  // R: ថ្នាក់
    DEPT: 14,   // S: ផ្នែកការងារ
    // PHOTO: 22, (AA) -> លែងប្រើ
    SHIFT_MON: 24, // AC: ចន្ទ
    SHIFT_TUE: 25, // AD: អង្គារ៍
    SHIFT_WED: 26, // AE: ពុធ
    SHIFT_THU: 27, // AF: ព្រហស្បត្តិ៍
    SHIFT_FRI: 28, // AG: សុក្រ
    SHIFT_SAT: 29, // AH: សៅរ៍
    SHIFT_SUN: 30, // AI: អាទិត្យ
    PHOTO: 31   // AJ: រូបថត (ថ្មី) <-- បានប្តូរទៅ 31
};

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCgc3fq9mDHMCjTRRHD3BPBL31JkKZgXFc",
    authDomain: "checkme-10e18.firebaseapp.com",
    projectId: "checkme-10e18",
    storageBucket: "checkme-10e18.firebasestorage.app",
    messagingSenderId: "1030447497157",
    appId: "1:1030447497157:web:9792086df1e864559fd5ac",
    measurementId: "G-QCJ2JH4WH6"
};

// --- តំបន់ទីតាំង (Polygon Geofence) ---
const allowedAreaCoords = [
    [11.415206789703271, 104.7642005060435],
    [11.41524294053174, 104.76409925265823],
    [11.413750665249953, 104.7633762203053],
    [11.41370399757057, 104.7634714387206]
];

// --- DOM Elements ---
const loadingView = document.getElementById('loadingView');
const loadingText = document.getElementById('loadingText');
const employeeListView = document.getElementById('employeeListView');
const attendanceView = document.getElementById('attendanceView');
const searchInput = document.getElementById('searchInput');
const employeeListContainer = document.getElementById('employeeListContainer');
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const exitAppButton = document.getElementById('exitAppButton');
const profileImage = document.getElementById('profileImage');
const profileName = document.getElementById('profileName');
const profileId = document.getElementById('profileId');
const profileGender = document.getElementById('profileGender');
const profileDepartment = document.getElementById('profileDepartment');
const profileGroup = document.getElementById('profileGroup');
const profileGrade = document.getElementById('profileGrade');
const profileShift = document.getElementById('profileShift');
const checkInButton = document.getElementById('checkInButton');
const checkOutButton = document.getElementById('checkOutButton');
const attendanceStatus = document.getElementById('attendanceStatus');
const historyTableBody = document.getElementById('historyTableBody');
const noHistoryRow = document.getElementById('noHistoryRow');
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalActions = document.getElementById('modalActions');
const modalCancelButton = document.getElementById('modalCancelButton');
const modalConfirmButton = document.getElementById('modalConfirmButton');

// --- Camera Modal DOM Elements ---
const cameraModal = document.getElementById('cameraModal');
const videoElement = document.getElementById('videoElement');
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraCloseButton = document.getElementById('cameraCloseButton');
const cameraLoadingText = document.getElementById('cameraLoadingText');
const cameraHelpText = document.getElementById('cameraHelpText');
const captureButton = document.getElementById('captureButton');


// --- Helper Functions ---

function changeView(viewId) {
    loadingView.style.display = 'none';
    employeeListView.style.display = 'none';
    attendanceView.style.display = 'none';

    if (viewId === 'loadingView') {
        loadingView.style.display = 'flex';
    } else if (viewId === 'employeeListView') {
        employeeListView.style.display = 'flex';
    } else if (viewId === 'attendanceView') {
        attendanceView.style.display = 'flex';
    }
}

function showMessage(title, message, isError = false) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalTitle.classList.toggle('text-red-600', isError);
    modalTitle.classList.toggle('text-gray-800', !isError);
    
    modalConfirmButton.textContent = 'យល់ព្រម';
    modalConfirmButton.className = "w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 col-span-2"; 
    modalCancelButton.style.display = 'none'; 
    
    currentConfirmCallback = null; 

    customModal.classList.remove('modal-hidden');
    customModal.classList.add('modal-visible');
}

function showConfirmation(title, message, confirmText, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalTitle.classList.remove('text-red-600');
    modalTitle.classList.add('text-gray-800');

    modalConfirmButton.textContent = confirmText;
    modalConfirmButton.className = "w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"; 
    modalCancelButton.style.display = 'block'; 
    
    currentConfirmCallback = onConfirm; 

    customModal.classList.remove('modal-hidden');
    customModal.classList.add('modal-visible');
}

function hideMessage() {
    customModal.classList.add('modal-hidden');
    customModal.classList.remove('modal-visible');
    currentConfirmCallback = null; 
}

function getTodayDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
}

function formatTime(date) {
    if (!date) return '--:--:--';
    try {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
        console.error('Invalid date object:', date);
        return 'Invalid Time';
    }
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(date) {
    if (!date) return '';
    try {
        const day = String(date.getDate()).padStart(2, '0');
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        console.error('Invalid date for formatDate:', date);
        return 'Invalid Date';
    }
}

// *** កែប្រែទី ៣: បន្ថែម Function សម្រាប់ញែក URL ***
/**
 * ញែក URL ចេញពី string ដូចជា '=IMAGE("http://...")'
 * @param {string} sheetValue តម្លៃឆៅពី Google Sheet
 * @returns {string|null} URL ដែលបានញែក ឬ null
 */
function parseImageUrl(sheetValue) {
    if (!sheetValue || typeof sheetValue !== 'string') {
        return null;
    }
    
    // ប្រើ Regular Expression ដើម្បីរក URL នៅក្នុង ("...")
    const match = sheetValue.match(/=IMAGE\("(.+?)"\)/i);
    
    if (match && match[1]) {
        return match[1]; // ត្រឡប់ URL (group ទី 1)
    }
    
    // Fallback: ប្រសិនបើវាមិនមែនជា hàm IMAGE តែជា URL ស្រាប់
    if (sheetValue.startsWith('http')) {
        return sheetValue;
    }
    
    // បើមិនដូច្នេះទេ គឺមិនត្រឹមត្រូវ
    console.warn('Could not parse image URL:', sheetValue);
    return null;
}


function checkShiftTime(shiftType, checkType) {
    if (!shiftType || shiftType === 'N/A') {
        console.warn(`វេនមិនបានកំណត់ (N/A)។ មិនអនុញ្ញាតឱ្យស្កេន។`);
        return false; 
    }

    if (shiftType === 'Uptime') {
        return true; 
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour + (currentMinute / 60);

    const shiftRules = {
        "ពេញម៉ោង": {
            checkIn: [6.83, 10.25], // 6:50 AM - 10:15 AM
            checkOut: [17.5, 20.25]  // 5:30 PM - 8:15 PM
        },
        "ពេលយប់": {
            checkIn: [17.66, 19.25], // 5:40 PM - 7:15 PM
            checkOut: [20.91, 21.83]  // 8:55 PM - 9:50 PM
        },
        "មួយព្រឹក": {
            checkIn: [6.83, 10.25], // 6:50 AM - 10:15 AM
            checkOut: [11.5, 13.25]  // 11:30 AM - 1:15 PM
        },
        "មួយរសៀល": {
            checkIn: [11.83, 14.5],  // 11:50 AM - 2:30 PM
            checkOut: [17.5, 20.25]   // 5:30 PM - 8:15 PM
        }
    };
    
    const rules = shiftRules[shiftType];
    
    if (!rules) {
        console.warn(`វេនមិនស្គាល់: "${shiftType}". មិនអនុញ្ញាតឱ្យស្កេន។`);
        return false; 
    }

    const [min, max] = rules[checkType];
    if (currentTime >= min && currentTime <= max) {
        return true; 
    }

    console.log(`ក្រៅម៉ោង: ម៉ោងបច្ចុប្បន្ន (${currentTime}) មិនស្ថិតក្នុងចន្លោះ [${min}, ${max}] សម្រាប់វេន "${shiftType}"`);
    return false; 
}

function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser.'));
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000, 
            maximumAge: 0 
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve(position.coords);
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error('សូមអនុញ្ញាតឱ្យប្រើប្រាស់ទីតាំង។ ប្រសិនបើអ្នកបាន Block, សូមចូលទៅកាន់ Site Settings របស់ Browser ដើម្បី Allow។'));
                        break;
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error('មិនអាចទាញយកទីតាំងបានទេ។'));
                        break;
                    case error.TIMEOUT:
                        reject(new Error('អស់ពេលកំណត់ក្នុងការទាញយកទីតាំង។'));
                        break;
                    default:
                        reject(new Error('មានបញ្ហាក្នុងការទាញយកទីតាំង។'));
                }
            },
            options
        );
    });
}

function isInsideArea(lat, lon) {
    const polygon = allowedAreaCoords;
    let isInside = false;
    const x = lon; 
    const y = lat; 

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const viy = polygon[i][0]; 
        const vix = polygon[i][1]; 
        const vjy = polygon[j][0]; 
        const vjx = polygon[j][1]; 

        const intersect = ((viy > y) !== (vjy > y)) &&
            (x < (vjx - vix) * (y - viy) / (vjy - viy) + vix);
        
        if (intersect) {
            isInside = !isInside; 
        }
    }
    return isInside;
}


// --- AI & Camera Functions ---

/**
 * ផ្ទុក AI Models ពី Folder '/models'
 */
async function loadAIModels() {
    const MODEL_URL = './models'; // ប្រាកដថាជា m តូច
    loadingText.textContent = 'កំពុងទាញយក AI Models...';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        console.log("AI Models Loaded");
        modelsLoaded = true;
        // បន្ទាប់ពីផ្ទុក Model រួច ទើបទៅទាញទិន្នន័យបុគ្គលិក
        await fetchGoogleSheetData();
    } catch (e) {
        console.error("Error loading AI models", e);
        showMessage('បញ្ហាធ្ងន់ធ្ងរ', `មិនអាចទាញយក AI Models បានទេ។ សូមពិនិត្យ Folder 'models' (m តូច)។ Error: ${e.message}`, true);
    }
}

/**
 * បង្កើត Face Matcher សម្រាប់បុគ្គលិកដែលបានជ្រើសរើស
 */
async function prepareFaceMatcher(imageUrl) {
    currentUserFaceMatcher = null; // Reset
    if (!imageUrl || imageUrl.includes('placehold.co')) {
        console.warn("No valid profile photo. Face scan will be disabled.");
        return;
    }

    try {
        // បង្ហាញ Loading នៅលើ Profile Card (បណ្ដោះអាសន្ន)
        profileName.textContent = 'កំពុងវិភាគរូបថត...';

        const img = await faceapi.fetchImage(imageUrl);
        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks()
                                     .withFaceDescriptor();
        
        if (detection) {
            currentUserFaceMatcher = new faceapi.FaceMatcher(detection.descriptor);
            console.log("Face matcher created successfully.");
        } else {
            console.warn("Could not find a face in the profile photo.");
            showMessage('បញ្ហារូបថត', 'រកមិនឃើញមុខនៅក្នុងរូបថត Profile ទេ។ មិនអាចប្រើការស្កេនមុខបានទេ។', true);
        }
    } catch (e) {
        console.error("Error loading profile photo for face matching:", e);
        showMessage('បញ្ហារូបថត', `មានបញ្ហាក្នុងការទាញយករូបថត Profile: ${e.message}`, true);
    } finally {
        // ដាក់ឈ្មោះត្រឡប់មកវិញ
        if (currentUser) {
            profileName.textContent = currentUser.name;
        }
    }
}

/**
 * បង្ហាញ Modal កាមេរ៉ា និងត្រៀមប៊ូតុងថត
 */
async function startFaceScan(action) {
    currentScanAction = action; // 'checkIn' or 'checkOut'

    if (!modelsLoaded) {
        showMessage('បញ្ហា', 'AI Models មិនទាន់ផ្ទុករួចរាល់។ សូមរង់ចាំបន្តិច។', true);
        return;
    }
    
    if (!currentUserFaceMatcher) {
        showMessage('បញ្ហា', 'មិនអាចស្កេនមុខបានទេ។ អាចមកពីមិនមានរូបថត Profile ឬរូបថតមិនច្បាស់។', true);
        return;
    }
    
    // Reset UI
    cameraLoadingText.textContent = 'កំពុងស្នើសុំកាមេរ៉ា...';
    cameraHelpText.textContent = 'សូមអនុញ្ញាតឱ្យប្រើប្រាស់កាមេរ៉ា';
    captureButton.style.display = 'none';
    captureButton.disabled = false;
    cameraCanvas.style.display = 'none'; // លាក់ Canvas

    cameraModal.classList.remove('modal-hidden');
    cameraModal.classList.add('modal-visible');

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user', // ប្រើកាមេរ៉ាមុខ
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        
        videoElement.srcObject = videoStream;
        
        videoElement.onplay = () => {
            // *** ថ្មី: កាមេរ៉ារួចរាល់, បង្ហាញប៊ូតុងថត ***
            cameraLoadingText.textContent = 'ត្រៀមរួចរាល់';
            cameraHelpText.textContent = 'សូមដាក់មុខឱ្យចំ រួចចុចប៊ូតុងថត';
            captureButton.style.display = 'flex'; // បង្ហាញប៊ូតុង
        };

    } catch (err) {
        console.error("Camera Error:", err);
        showMessage('បញ្ហាកាមេរ៉ា', `មិនអាចបើកកាមេរ៉ាបានទេ។ សូមអនុញ្ញាត (Allow)។ Error: ${err.message}`, true);
        hideCameraModal();
    }
}

/**
 * បិទកាមេរ៉ា និង Stream
 */
function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    videoElement.srcObject = null;
}

/**
 * បិទ Modal កាមេរ៉ា
 */
function hideCameraModal() {
    stopCamera();
    cameraModal.classList.add('modal-hidden');
    cameraModal.classList.remove('modal-visible');
    // Clear canvas
    cameraCanvas.getContext('2d').clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
}

/**
 * មុខងារសម្រាប់ថត និងវិភាគ
 */
async function handleCaptureAndAnalyze() {
    if (!videoStream) return; // បើមិនមានកាមេរ៉ា មិនត្រូវធ្វើអ្វីទេ

    // 1. បង្ហាញ UI ថា កំពុងដំណើរការ
    cameraLoadingText.textContent = 'កំពុងវិភាគ...';
    cameraHelpText.textContent = 'សូមរង់ចាំបន្តិច';
    captureButton.disabled = true;
    
    // 2. រៀបចំ Canvas សម្រាប់គូររូប (ដើម្បីទាញរូបពី Video)
    const displaySize = { width: videoElement.videoWidth, height: videoElement.videoHeight };
    faceapi.matchDimensions(cameraCanvas, displaySize);
    
    // គូររូបពី Video ទៅលើ Canvas (បណ្តោះអាសន្ន)
    cameraCanvas.getContext('2d').drawImage(videoElement, 0, 0, displaySize.width, displaySize.height);

    try {
        // 3. ស្កេនរកមុខ *តែម្តង* ពី Canvas
        const detection = await faceapi.detectSingleFace(cameraCanvas, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks()
                                     .withFaceDescriptor();

        if (!detection) {
            // រកមុខមិនឃើញ
            cameraLoadingText.textContent = 'រកមិនឃើញផ្ទៃមុខ!';
            cameraHelpText.textContent = 'សូមដាក់មុខឱ្យចំ រួចព្យាយាមម្តងទៀត។';
            captureButton.disabled = false; // អនុញ្ញាតឱ្យថតម្តងទៀត
            return;
        }

        // 4. ប្រសិនបើរកឃើញ, ចាប់ផ្តើមប្រៀបធៀប
        const bestMatch = currentUserFaceMatcher.findBestMatch(detection.descriptor);
        const matchPercentage = Math.round((1 - bestMatch.distance) * 100);

        // គូរប្រអប់ជុំវិញមុខ (ដើម្បីឱ្យអ្នកប្រើឃើញ)
        const resizedDetection = faceapi.resizeResults(detection, displaySize);
        faceapi.draw.drawDetections(cameraCanvas, resizedDetection);
        cameraCanvas.style.display = 'block'; // បង្ហាញ Canvas ដែលមានគូសប្រអប់

        if (bestMatch.label !== 'unknown' && bestMatch.distance < FACE_MATCH_THRESHOLD) {
            // *** ជោគជ័យ ***
            cameraLoadingText.textContent = `ស្គាល់ជា: ${currentUser.name} (${matchPercentage}%)`;
            cameraHelpText.textContent = 'កំពុងបន្តដំណើរការ...';
            
            // រង់ចាំ 1 វិនាទី (ឱ្យអ្នកប្រើឃើញលទ្ធផល)
            setTimeout(() => {
                hideCameraModal();

                // បន្តដំណើរការ CheckIn/CheckOut
                if (currentScanAction === 'checkIn') {
                    handleCheckIn();
                } else if (currentScanAction === 'checkOut') {
                    handleCheckOut();
                }
            }, 1000);

        } else {
            // *** បរាជ័យ (មិនស្គាល់ ឬ មិនត្រូវ) ***
            cameraLoadingText.textContent = `មិនត្រឹមត្រូវ... (${matchPercentage}%)`;
            cameraHelpText.textContent = 'នេះមិនមែនជាគណនីរបស់អ្នកទេ។ សូមព្យាយាមម្តងទៀត។';
            captureButton.disabled = false; // អនុញ្ញាតឱ្យថតម្តងទៀត
        }

    } catch (e) {
        console.error("Analysis Error:", e);
        cameraLoadingText.textContent = 'ការវិភាគមានបញ្ហា!';
        cameraHelpText.textContent = e.message;
        captureButton.disabled = false;
    }
}


// --- Main Functions ---

async function initializeAppFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('debug');
        await setupAuthListener(); // ដំណើរការ Auth Listener
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showMessage('បញ្ហាធ្ងន់ធ្ងរ', `មិនអាចភ្ជាប់ទៅ Firebase បានទេ: ${error.message}`, true);
    }
}

async function setupAuthListener() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log('Firebase Auth user signed in:', user.uid);
                // ផ្ទុក AI Models ជាមុនសិន
                await loadAIModels(); 
                resolve();
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Firebase Sign In Error:", error);
                    showMessage('បញ្ហា Sign In', `មិនអាច Sign In ទៅ Firebase បានទេ: ${error.message}`, true);
                    reject(error);
                }
            }
        });
    });
}

async function fetchGoogleSheetData() {
    changeView('loadingView'); 
    loadingText.textContent = 'កំពុងទាញបញ្ជីបុគ្គលិក...'; 
        
    try {
        const response = await fetch(GVIZ_URL);
        if (!response.ok) {
            throw new Error(`Network response was not ok (${response.status})`);
        }
        let text = await response.text();
        
        const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
        if (!jsonText || !jsonText[1]) {
            throw new Error('Invalid Gviz response format.');
        }
        
        const data = JSON.parse(jsonText[1]);
        
        if (data.status === 'error') {
            throw new Error(`Google Sheet Error: ${data.errors.map(e => e.detailed_message).join(', ')}`);
        }

        allEmployees = data.table.rows
            .map(row => {
                const cells = row.c;
                const id = cells[COL_INDEX.ID]?.v;
                if (!id) {
                    return null;
                }
                
                // *** កែប្រែទី ៤: ប្រើ Function ថ្មីដើម្បីទាញ Photo URL ***
                const rawPhotoValue = cells[COL_INDEX.PHOTO]?.v || null;
                
                return {
                    id: String(id).trim(),
                    name: cells[COL_INDEX.NAME]?.v || 'N/A',
                    department: cells[COL_INDEX.DEPT]?.v || 'N/A',
                    photoUrl: parseImageUrl(rawPhotoValue), // <-- ប្រើ Function ថ្មី
                    group: cells[COL_INDEX.GROUP]?.v || 'N/A',
                    gender: cells[COL_INDEX.GENDER]?.v || 'N/A',
                    grade: cells[COL_INDEX.GRADE]?.v || 'N/A',
                    shiftMon: cells[COL_INDEX.SHIFT_MON]?.v || null,
                    shiftTue: cells[COL_INDEX.SHIFT_TUE]?.v || null,
                    shiftWed: cells[COL_INDEX.SHIFT_WED]?.v || null,
                    shiftThu: cells[COL_INDEX.SHIFT_THU]?.v || null,
                    shiftFri: cells[COL_INDEX.SHIFT_FRI]?.v || null,
                    shiftSat: cells[COL_INDEX.SHIFT_SAT]?.v || null,
                    shiftSun: cells[COL_INDEX.SHIFT_SUN]?.v || null,
                };
            })
            .filter(emp => emp !== null)
            .filter(emp => emp.group === 'IT Support');

        console.log(`Loaded ${allEmployees.length} employees (Filtered).`);
        renderEmployeeList(allEmployees); 
        
        const savedEmployeeId = localStorage.getItem('savedEmployeeId');
        if (savedEmployeeId) {
            const savedEmployee = allEmployees.find(emp => emp.id === savedEmployeeId);
            if (savedEmployee) {
                console.log('Logging in with saved user:', savedEmployee.name);
                selectUser(savedEmployee); 
            } else {
                console.log('Saved user ID not found in list. Clearing storage.');
                localStorage.removeItem('savedEmployeeId');
                changeView('employeeListView'); 
            }
        } else {
            changeView('employeeListView'); 
        }
        
    } catch (error) {
        console.error('Fetch Google Sheet Error:', error);
        showMessage('បញ្ហាទាញទិន្នន័យ', `មិនអាចទាញទិន្នន័យពី Google Sheet បានទេ។ សូមប្រាកដថា Sheet ត្រូវបាន Publish to the web។ Error: ${error.message}`, true);
    }
}

function renderEmployeeList(employees) {
    employeeListContainer.innerHTML = ''; 
    employeeListContainer.classList.remove('hidden');

    if (employees.length === 0) {
        employeeListContainer.innerHTML = `<p class="text-center text-gray-500 p-3">រកមិនឃើញបុគ្គលិក (IT Support) ទេ។</p>`;
        return;
    }

    employees.forEach(emp => {
        const card = document.createElement('div');
        card.className = "flex items-center p-3 rounded-xl cursor-pointer hover:bg-blue-50 transition-all shadow-md mb-2 bg-white";
        card.innerHTML = `
            <img src="${emp.photoUrl || 'https://placehold.co/48x48/e2e8f0/64748b?text=No+Img'}" 
                 alt="រូបថត" 
                 class="w-12 h-12 rounded-full object-cover border-2 border-gray-100 mr-3"
                 onerror="this.src='https://placehold.co/48x48/e2e8f0/64748b?text=Error'">
            <div>
                <h3 class="text-md font-semibold text-gray-800">${emp.name}</h3>
                <p class="text-sm text-gray-500">ID: ${emp.id} | ក្រុម: ${emp.group}</p>
            </div>
        `;
        card.onmousedown = () => selectUser(emp);
        employeeListContainer.appendChild(card);
    });
}

function selectUser(employee) {
    console.log('User selected:', employee);
    currentUser = employee;
    
    localStorage.setItem('savedEmployeeId', employee.id);

    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayToShiftKey = [
        'shiftSun', 'shiftMon', 'shiftTue', 'shiftWed', 'shiftThu', 'shiftFri', 'shiftSat'
    ];
    const shiftKey = dayToShiftKey[dayOfWeek];
    currentUserShift = currentUser[shiftKey] || 'N/A'; 
    console.log(`ថ្ងៃនេះ (Day ${dayOfWeek}), វេនគឺ: ${currentUserShift}`);

    const firestoreUserId = currentUser.id; 
    const simpleDataPath = `attendance/${firestoreUserId}/records`;
    console.log("Using Firestore Path:", simpleDataPath);
    attendanceCollectionRef = collection(db, simpleDataPath);

    // បំពេញព័ត៌មាន Profile
    welcomeMessage.textContent = `សូមស្វាគមន៍`; 
    profileImage.src = employee.photoUrl || 'https://placehold.co/80x80/e2e8f0/64748b?text=No+Img';
    profileName.textContent = employee.name;
    profileId.textContent = `អត្តលេខ: ${employee.id}`;
    profileGender.textContent = `ភេទ: ${employee.gender}`;
    profileDepartment.textContent = `ផ្នែក: ${employee.department}`;
    profileGroup.textContent = `ក្រុម: ${employee.group}`;
    profileGrade.textContent = `ថ្នាក់: ${employee.grade}`;
    profileShift.textContent = `វេនថ្ងៃនេះ: ${currentUserShift}`;

    changeView('attendanceView');
    setupAttendanceListener();

    // រៀបចំ Face Matcher នៅ Background
    prepareFaceMatcher(employee.photoUrl);

    employeeListContainer.classList.add('hidden');
    searchInput.value = '';
}

function logout() {
    currentUser = null;
    currentUserShift = null; 
    currentUserFaceMatcher = null; // Clear face matcher
    
    localStorage.removeItem('savedEmployeeId');

    if (attendanceListener) {
        attendanceListener();
        attendanceListener = null;
    }
    
    attendanceCollectionRef = null;
    globalAttendanceList = [];
    
    historyTableBody.innerHTML = '';
    historyTableBody.appendChild(noHistoryRow);
    searchInput.value = ''; 
    employeeListContainer.classList.add('hidden'); 
    
    changeView('employeeListView');
}

function setupAttendanceListener() {
    if (!attendanceCollectionRef) return;
    
    if (attendanceListener) {
        attendanceListener();
    }

    checkInButton.disabled = true;
    checkOutButton.disabled = true;
    attendanceStatus.textContent = 'កំពុងទាញប្រវត្តិវត្តមាន...';
    attendanceStatus.className = 'text-center text-sm text-gray-500 pb-4 px-6 h-5 animate-pulse'; 

    attendanceListener = onSnapshot(attendanceCollectionRef, (querySnapshot) => {
        globalAttendanceList = [];
        querySnapshot.forEach((doc) => {
            globalAttendanceList.push(doc.data());
        });

        globalAttendanceList.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        console.log('Attendance data updated:', globalAttendanceList);
        renderHistory();
        updateButtonState(); 
        
    }, (error) => {
        console.error("Error listening to attendance:", error);
        showMessage('បញ្ហា', 'មិនអាចស្តាប់ទិន្នន័យវត្តមានបានទេ។', true);
        attendanceStatus.textContent = 'Error';
        attendanceStatus.className = 'text-center text-sm text-red-500 pb-4 px-6 h-5';
    });
}

function renderHistory() {
    historyTableBody.innerHTML = ''; 
    const todayString = getTodayDateString();

    const todayRecord = globalAttendanceList.find(record => record.date === todayString);

    if (!todayRecord) {
        historyTableBody.appendChild(noHistoryRow); 
        return;
    }

    const checkInTime = todayRecord.checkIn || '---';
    const checkOutTime = todayRecord.checkOut ? todayRecord.checkOut : '<span class="text-gray-400">មិនទាន់ចេញ</span>';
    const formattedDate = todayRecord.formattedDate || todayRecord.date; 
    
    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50'; 
    row.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">${formattedDate}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-green-600 font-semibold">${checkInTime}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm ${todayRecord.checkOut ? 'text-red-600 font-semibold' : ''}">${checkOutTime}</td>
    `;
    historyTableBody.appendChild(row);
}

function updateButtonState() {
    const todayString = getTodayDateString();
    const todayData = globalAttendanceList.find(record => record.date === todayString);
    
    const canCheckIn = checkShiftTime(currentUserShift, 'checkIn');
    const canCheckOut = checkShiftTime(currentUserShift, 'checkOut');

    // Reset
    checkInButton.disabled = false;
    checkOutButton.disabled = true;
    attendanceStatus.textContent = 'សូមធ្វើការ Check-in';
    attendanceStatus.className = 'text-center text-sm text-blue-700 pb-4 px-6 h-5'; 

    if (!canCheckIn && !todayData) {
         attendanceStatus.textContent = `ក្រៅម៉ោង Check-in (${currentUserShift})`;
         attendanceStatus.className = 'text-center text-sm text-yellow-600 pb-4 px-6 h-5';
    }

    if (todayData) {
        if (todayData.checkIn) {
            checkInButton.disabled = true;
            checkOutButton.disabled = false; 
            attendanceStatus.textContent = `បាន Check-in ម៉ោង: ${todayData.checkIn}`;
            attendanceStatus.className = 'text-center text-sm text-green-700 pb-4 px-6 h-5';
            
            if (!canCheckOut && !todayData.checkOut) {
                attendanceStatus.textContent = `ក្រៅម៉ោង Check-out (${currentUserShift})`;
                attendanceStatus.className = 'text-center text-sm text-yellow-600 pb-4 px-6 h-5';
            }
        }
        if (todayData.checkOut) {
            checkOutButton.disabled = true;
            attendanceStatus.textContent = `បាន Check-out ម៉ោង: ${todayData.checkOut}`;
            attendanceStatus.className = 'text-center text-sm text-red-700 pb-4 px-6 h-5';
        }
    }
}

/**
 * 10. ដំណើរការ Check In (ត្រូវបានហៅ *បន្ទាប់ពី* ស្កេនមុខជោគជ័យ)
 */
async function handleCheckIn() {
    if (!attendanceCollectionRef || !currentUser) return;
    
    // --- 1. ពិនិត្យវេន (Shift Check) ---
    if (!checkShiftTime(currentUserShift, 'checkIn')) {
        showMessage('បញ្ហា', `ក្រៅម៉ោង Check-in សម្រាប់វេន "${currentUserShift}" របស់អ្នក។`, true);
        return;
    }

    // --- 2. ពិនិត្យទីតាំង (Location Check) ---
    checkInButton.disabled = true;
    checkOutButton.disabled = true;
    attendanceStatus.textContent = 'កំពុងពិនិត្យទីតាំង...';
    attendanceStatus.classList.add('animate-pulse');

    let userCoords;
    try {
        userCoords = await getUserLocation();
        console.log('User location:', userCoords.latitude, userCoords.longitude);
        
        if (!isInsideArea(userCoords.latitude, userCoords.longitude)) {
            showMessage('បញ្ហាទីតាំង', 'អ្នកមិនស្ថិតនៅក្នុងទីតាំងកំណត់ទេ។ សូមចូលទៅក្នុងតំបន់ការិយាល័យ រួចព្យាយាមម្តងទៀត។', true);
            updateButtonState(); 
            attendanceStatus.classList.remove('animate-pulse');
            attendanceStatus.textContent = 'បរាជ័យ (ក្រៅទីតាំង)';
            attendanceStatus.className = 'text-center text-sm text-red-700 pb-4 px-6 h-5';
            return; 
        }
        
        console.log('User is INSIDE the area.');
        
    } catch (error) {
        console.error("Location Error:", error.message);
        showMessage('បញ្ហាទីតាំង', error.message, true);
        updateButtonState(); 
        attendanceStatus.classList.remove('animate-pulse');
        return; 
    }
    
    // --- 3. ដំណើរការរក្សាទុក (Save to Firebase) ---
    attendanceStatus.textContent = 'កំពុងដំណើរការ Check-in...';

    const now = new Date();
    const todayDocId = getTodayDateString(now);
    
    const data = {
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        department: currentUser.department,
        group: currentUser.group,
        grade: currentUser.grade,
        gender: currentUser.gender,
        shift: currentUserShift, 
        date: todayDocId, 
        checkInTimestamp: now.toISOString(), 
        checkOutTimestamp: null,
        formattedDate: formatDate(now),
        checkIn: formatTime(now),
        checkOut: null,
        checkInLocation: { lat: userCoords.latitude, lon: userCoords.longitude },
    };

    try {
        const todayDocRef = doc(attendanceCollectionRef, todayDocId);
        await setDoc(todayDocRef, data); 
    } catch (error) {
        console.error("Check In Error:", error);
        showMessage('បញ្ហា', `មិនអាច Check-in បានទេ: ${error.message}`, true);
        updateButtonState(); 
    } finally {
        attendanceStatus.classList.remove('animate-pulse');
    }
}

/**
 * 11. ដំណើរការ Check Out (ត្រូវបានហៅ *បន្ទាប់ពី* ស្កេនមុខជោគជ័យ)
 */
async function handleCheckOut() {
    if (!attendanceCollectionRef) return;

    // --- 1. ពិនិត្យវេន (Shift Check) ---
    if (!checkShiftTime(currentUserShift, 'checkOut')) {
        showMessage('បញ្ហា', `ក្រៅម៉ោង Check-out សម្រាប់វេន "${currentUserShift}" របស់អ្នក។`, true);
        return;
    }

    // --- 2. ពិនិត្យទីតាំង (Location Check) ---
    checkInButton.disabled = true;
    checkOutButton.disabled = true;
    attendanceStatus.textContent = 'កំពុងពិនិត្យទីតាំង...';
    attendanceStatus.classList.add('animate-pulse');

    let userCoords;
    try {
        userCoords = await getUserLocation();
        console.log('User location:', userCoords.latitude, userCoords.longitude);

        if (!isInsideArea(userCoords.latitude, userCoords.longitude)) {
            showMessage('បញ្ហាទីតាំង', 'អ្នកមិនស្ថិតនៅក្នុងទីតាំងកំណត់ទេ។ សូមចូលទៅក្នុងតំបន់ការិយាល័យ រួចព្យាយាមម្តងទៀត។', true);
            updateButtonState(); 
            attendanceStatus.classList.remove('animate-pulse');
            attendanceStatus.textContent = 'បរាជ័យ (ក្រៅទីតាំង)';
            attendanceStatus.className = 'text-center text-sm text-red-700 pb-4 px-6 h-5';
            return; 
        }
        
        console.log('User is INSIDE the area.');

    } catch (error) {
        console.error("Location Error:", error.message);
        showMessage('បញ្ហាទីតាំង', error.message, true);
        updateButtonState(); 
        attendanceStatus.classList.remove('animate-pulse');
        return; 
    }

    // --- 3. ដំណើរការរក្សាទុក (Save to Firebase) ---
    attendanceStatus.textContent = 'កំពុងដំណើរការ Check-out...';
    
    const now = new Date();
    const todayDocId = getTodayDateString(now);
    
    const data = {
        checkOutTimestamp: now.toISOString(),
        checkOut: formatTime(now),
        checkOutLocation: { lat: userCoords.latitude, lon: userCoords.longitude },
    };

    try {
        const todayDocRef = doc(attendanceCollectionRef, todayDocId);
        await updateDoc(todayDocRef, data); 
    } catch (error) {
        console.error("Check Out Error:", error);
        showMessage('បញ្ហា', `មិនអាច Check-out បានទេ: ${error.message}`, true);
        updateButtonState(); 
    } finally {
        attendanceStatus.classList.remove('animate-pulse');
    }
}

// --- Event Listeners ---
 
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredEmployees = allEmployees.filter(emp => 
        emp.name.toLowerCase().includes(searchTerm) ||
        emp.id.toLowerCase().includes(searchTerm)
    );
    renderEmployeeList(filteredEmployees); 
});

searchInput.addEventListener('focus', () => {
    renderEmployeeList(allEmployees); 
});

searchInput.addEventListener('blur', () => {
    setTimeout(() => {
        employeeListContainer.classList.add('hidden');
    }, 200); 
});


logoutButton.addEventListener('click', () => {
    showConfirmation('ចាកចេញ', 'តើអ្នកប្រាកដជាចង់ចាកចេញមែនទេ? គណនីរបស់អ្នកនឹងមិនត្រូវបានចងចាំទៀតទេ។', 'ចាកចេញ', () => {
        logout();
        hideMessage();
    });
});

exitAppButton.addEventListener('click', () => {
    showConfirmation('បិទកម្មវិធី', 'តើអ្នកប្រាកដជាចង់បិទកម្មវិធីមែនទេ?', 'បិទកម្មវិធី', () => {
        window.close();
        hideMessage();
    });
});

// ប៊ូតុង Check-in/Out ឥឡូវត្រូវហៅ startFaceScan
checkInButton.addEventListener('click', () => startFaceScan('checkIn'));
checkOutButton.addEventListener('click', () => startFaceScan('checkOut'));

// Modal Confirm/Cancel Listeners
modalCancelButton.addEventListener('click', hideMessage);
modalConfirmButton.addEventListener('click', () => {
    if (currentConfirmCallback) {
        currentConfirmCallback(); 
    } else {
        hideMessage(); 
    }
});

// ប៊ូតុងបិទកាមេរ៉ា
cameraCloseButton.addEventListener('click', hideCameraModal);

// ប៊ូតុងថត ហៅ handleCaptureAndAnalyze
captureButton.addEventListener('click', handleCaptureAndAnalyze);


// --- Initial Call ---
document.addEventListener('DOMContentLoaded', () => {
    // ហៅតែ initializeAppFirebase ទេ
    // loadAIModels() នឹងត្រូវបានហៅពីក្នុង Auth Listener
    initializeAppFirebase();
});
