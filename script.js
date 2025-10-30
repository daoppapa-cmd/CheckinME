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

// --- AI Model & Camera Variables ---
let areModelsLoaded = false;
// *** កែសម្រួល៖ ទាញយកពី Folder ក្នុង Project តាមការស្នើសុំ ***
const MODEL_URL = './models';
let cameraStream = null;
let currentUserFaceDescriptor = null; // Descriptor ពីរូប Profile
let faceVerificationCallback = null; // Function (checkIn/checkOut) ត្រូវហៅក្រោយផ្ទៀងផ្ទាត់
const FACE_MATCH_THRESHOLD = 0.5; // កម្រិតនៃការតម្រង់ (0.1 = តឹង, 0.6 = ធូរ)

// --- Google Sheet Configuration ---
const SHEET_ID = '1eRyPoifzyvB4oBmruNyXcoKMKPRqjk6xDD6-bPNW6pc';
const SHEET_NAME = 'DIList';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}&range=E9:AI`;
const COL_INDEX = {
    ID: 0,    // E: អត្តលេខ
    GROUP: 2,   // G: ក្រុម
    NAME: 7,    // L: ឈ្មោះ
    GENDER: 9,  // N: ភេទ
    GRADE: 13,  // R: ថ្នាក់
    DEPT: 14,   // S: ផ្នែកការងារ
    PHOTO: 22,  // AA: រូបថត
    SHIFT_MON: 24, // AC: ចន្ទ
    SHIFT_TUE: 25, // AD: អង្គារ៍
    SHIFT_WED: 26, // AE: ពុធ
    SHIFT_THU: 27, // AF: ព្រហស្បត្តិ៍
    SHIFT_FRI: 28, // AG: សុក្រ
    SHIFT_SAT: 29, // AH: សៅរ៍
    SHIFT_SUN: 30  // AI: អាទិត្យ
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

// --- Processing Modal DOM Elements ---
const processingModal = document.getElementById('processingModal');
const processingLoader = document.getElementById('processingLoader');
const processingSuccessIcon = document.getElementById('processingSuccessIcon');
const processingErrorIcon = document.getElementById('processingErrorIcon');
const processingMessage = document.getElementById('processingMessage');
const processingSubMessage = document.getElementById('processingSubMessage');
const processingOkButton = document.getElementById('processingOkButton');

// --- Camera Modal DOM Elements ---
const cameraModal = document.getElementById('cameraModal');
const cameraModalTitle = document.getElementById('cameraModalTitle');
const cameraVideo = document.getElementById('cameraVideo');
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraOverlay = document.getElementById('cameraOverlay');
const cameraLoader = document.getElementById('cameraLoader');
const cameraStatus = document.getElementById('cameraStatus');
const cameraCancelButton = document.getElementById('cameraCancelButton');
const cameraCaptureButton = document.getElementById('cameraCaptureButton');

// --- Helper Functions (ដូចមុន) ---

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
            reject(new Error('Geolocation មិនត្រូវបានគាំទ្រទេ។'));
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

/**
 * 4.5. ស្នើសុំសិទ្ធិទីតាំង (Prime Location Permission)
 * ហៅ function នេះម្តងនៅពេល login ដើម្បីឱ្យ browser សួរ permission
 * មុនពេល camera modal បើកបាំង
 */
function primeLocationPermission() {
    console.log('Priming location permission...');
    if (!navigator.geolocation) {
        console.warn('Geolocation not supported, cannot prime.');
        return;
    }
    // គ្រាន់តែហៅវា មិនបាច់ធ្វើអ្វីជាមួយ data ទេ
    // គោលបំណងគឺដើម្បីឱ្យ browser បង្ហាញ pop-up សុំសិទ្ធិ
    navigator.geolocation.getCurrentPosition(
        (position) => {
            console.log('Location permission already granted or successfully primed.');
        },
        (error) => {
            // មិនបាច់បង្ហាញ Error ខ្លាំងពេកទេ ព្រោះ getUserLocation() ពេលក្រោយ
            // នឹង handle error នេះម្តងទៀត
            console.warn(`Priming location failed: ${error.message}`);
        },
        { timeout: 5000 } // ឱ្យវារត់ 5 វិនាទីបានហើយ
    );
}

/**
 * 4.6 បង្ហាញ/បិទ Processing Modal
 */
function showProcessingModal(message, subMessage = "សូមរង់ចាំ...") {
    processingMessage.textContent = message;
    processingSubMessage.textContent = subMessage;
    
    processingLoader.style.display = 'block';
    processingSuccessIcon.style.display = 'none';
    processingErrorIcon.style.display = 'none';
    processingOkButton.style.display = 'none';
    
    processingMessage.classList.remove('text-green-600', 'text-red-600');
    processingMessage.classList.add('text-gray-700');
    
    processingModal.classList.remove('modal-hidden');
    processingModal.classList.add('modal-visible');
}

function showProcessingSuccess(message, subMessage = "") {
    processingMessage.textContent = message;
    processingSubMessage.textContent = subMessage;
    
    processingLoader.style.display = 'none';
    processingSuccessIcon.style.display = 'block';
    processingErrorIcon.style.display = 'none';
    processingOkButton.style.display = 'none';

    processingMessage.classList.remove('text-gray-700', 'text-red-600');
    processingMessage.classList.add('text-green-600');
}

function showProcessingError(message, subMessage) {
    processingMessage.textContent = message;
    processingSubMessage.textContent = subMessage;
    
    processingLoader.style.display = 'none';
    processingSuccessIcon.style.display = 'none';
    processingErrorIcon.style.display = 'block';
    processingOkButton.style.display = 'block'; // បង្ហាញប៊ូតុង OK

    processingMessage.classList.remove('text-gray-700', 'text-green-600');
    processingMessage.classList.add('text-red-600');
}

function hideProcessingModal() {
     processingModal.classList.add('modal-hidden');
     processingModal.classList.remove('modal-visible');
}


// --- AI & Camera Functions ---

/**
 * ទាញយក AI Models
 */
async function loadAIModels() {
    if (areModelsLoaded) return;
    
    console.log('Loading AI Models...');
    loadingText.textContent = 'កំពុងទាញយក AI Models...';
    
    try {
        // ខ្ញុំប្រើ Model តូចៗ (tiny) ដើម្បីឱ្យលឿន
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        console.log('AI Models loaded successfully.');
        areModelsLoaded = true;
    } catch (error) {
        console.error('Error loading AI Models:', error);
        showMessage('បញ្ហា AI Model', `មិនអាចទាញយក Model បានទេ៖ ${error.message}`, true);
    }
}

/**
 * បើក Camera Modal និងចាប់ផ្ដើម Stream
 */
async function openFaceVerificationModal(title, onVerifiedCallback) {
    if (!areModelsLoaded) {
        showMessage('បញ្ហា', 'AI Models មិនទាន់ទាញយករួចរាល់ទេ។ សូមរង់ចាំបន្តិច។', true);
        return;
    }
    
    faceVerificationCallback = onVerifiedCallback; // រក្សាទុក function ដែលត្រូវហៅ
    currentUserFaceDescriptor = null; // Reset
    
    cameraModalTitle.textContent = title;
    cameraModal.classList.remove('modal-hidden');
    cameraModal.classList.add('modal-visible');
    
    cameraCaptureButton.disabled = true;
    cameraOverlay.style.display = 'flex';
    cameraStatus.textContent = 'កំពុងបើកកាមេរ៉ា...';

    // 1. ចាប់ផ្ដើមបើកកាមេរ៉ា
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }, // ប្រើកាមេរ៉ាមុខ
            audio: false
        });
        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();
    } catch (err) {
        console.error("Error starting camera:", err);
        showMessage('បញ្ហាកាមេរ៉ា', 'មិនអាចបើកកាមេរ៉ាបានទេ។ សូមអនុញ្ញាត (Allow)។', true);
        closeFaceVerificationModal();
        return;
    }

    // 2. វិភាគរូប Profile (Reference Image)
    cameraStatus.textContent = 'កំពុងវិភាគរូប Profile...';
    try {
        const referenceImage = document.getElementById('profileImage');
        // ត្រូវប្រាកដថារូបថតបាន load រួចរាល់
        if (!referenceImage.complete || referenceImage.naturalHeight === 0) {
            // បើករណីរូបថតមិនទាន់ load (ឧ. ពេល login ដំបូង)
            console.log('Waiting for reference image to load...');
            await new Promise((resolve, reject) => {
                referenceImage.onload = resolve;
                referenceImage.onerror = (err) => {
                    console.error('Reference image failed to load:', err);
                    reject(new Error('រូបថត Profile មិនអាចទាញយកបានទេ។'));
                };
            });
            console.log('Reference image loaded.');
        }
        
        const detection = await faceapi.detectSingleFace(referenceImage, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks(true)
                                     .withFaceDescriptor();
        
        if (!detection) {
            throw new Error('រកមិនឃើញផ្ទៃមុខក្នុងរូប Profile ទេ។');
        }
        
        currentUserFaceDescriptor = detection.descriptor;
        console.log('Reference profile face descriptor created.');
        
        // 3. ត្រៀមខ្លួនថត
        cameraOverlay.style.display = 'none';
        cameraStatus.textContent = '';
        cameraCaptureButton.disabled = false;

    } catch (error) {
        console.error('Error getting reference descriptor:', error);
        showMessage('បញ្ហា Profile', `មិនអាចវិភាគរូប Profile បានទេ៖ ${error.message}`, true);
        closeFaceVerificationModal();
    }
}

/**
 * បិទ Camera Modal និងបញ្ឈប់ Stream
 */
function closeFaceVerificationModal() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraModal.classList.add('modal-hidden');
    cameraModal.classList.remove('modal-visible');
    
    cameraOverlay.style.display = 'none';
    cameraCaptureButton.disabled = false;
    faceVerificationCallback = null;
    currentUserFaceDescriptor = null;
}

/**
 * ដំណើរការពេលចុចប៊ូតុង "ថតរូប"
 */
async function handleCameraCapture() {
    if (!currentUserFaceDescriptor) {
        showMessage('បញ្ហា', 'Reference descriptor មិនទាន់រួចរាល់។', true);
        return;
    }

    cameraCaptureButton.disabled = true;
    cameraOverlay.style.display = 'flex';
    cameraStatus.textContent = 'កំពុងវិភាគ...';

    try {
        // 1. ថតរូបពី Video
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        const context = cameraCanvas.getContext('2d');
        context.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
        
        // 2. វិភាគរកផ្ទៃមុខក្នុងរូបដែលថត (Live Image)
        const detection = await faceapi.detectSingleFace(cameraCanvas, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks(true)
                                     .withFaceDescriptor();

        if (!detection) {
            cameraStatus.textContent = 'រកមិនឃើញផ្ទៃមុខ! សូមព្យាយាមម្ដងទៀត។';
            setTimeout(() => {
                cameraOverlay.style.display = 'none';
                cameraCaptureButton.disabled = false;
            }, 2000);
            return;
        }
        
        // 3. ប្រៀបធៀបផ្ទៃមុខ (Reference vs Live)
        const liveDescriptor = detection.descriptor;
        const distance = faceapi.euclideanDistance(currentUserFaceDescriptor, liveDescriptor);
        
        console.log(`Face match distance: ${distance}`);

        if (distance <= FACE_MATCH_THRESHOLD) {
            // ជោគជ័យ!
            cameraStatus.textContent = 'ផ្ទៀងផ្ទាត់ជោគជ័យ!';
            console.log('Face verified!');
            
            setTimeout(() => {
                closeFaceVerificationModal();
                if (faceVerificationCallback) {
                    faceVerificationCallback(); // ហៅ function (checkIn/checkOut) បន្ត
                }
            }, 1500);

        } else {
            // បរាជ័យ!
            cameraStatus.textContent = 'ផ្ទៃមុខមិនត្រឹមត្រូវ! (Distance: ' + distance.toFixed(2) + ')';
            console.warn('Face verification failed.');
            setTimeout(() => {
                cameraOverlay.style.display = 'none';
                cameraCaptureButton.disabled = false;
            }, 2500);
        }

    } catch (error) {
        console.error('Error during capture/verification:', error);
        cameraStatus.textContent = 'មានបញ្ហាពេលវិភាគ!';
        setTimeout(() => {
            cameraOverlay.style.display = 'none';
            cameraCaptureButton.disabled = false;
        }, 2000);
    }
}

// --- Main Functions (កែសម្រួល) ---

async function initializeAppFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('debug');
        await setupAuthListener();
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
                
                // ហៅ AI Model មុនពេលទាញទិន្នន័យ Sheet
                // ដើម្បីឱ្យវា load ស្របគ្នា
                await loadAIModels(); 
                
                await fetchGoogleSheetData();
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
    
    // ប្រសិនបើ Model មិនទាន់ load រួច
    if (!areModelsLoaded) {
         loadingText.textContent = 'កំពុងទាញយក AI Models...';
         await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (areModelsLoaded) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
         });
    }
    
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
                return {
                    id: String(id).trim(),
                    name: cells[COL_INDEX.NAME]?.v || 'N/A',
                    department: cells[COL_INDEX.DEPT]?.v || 'N/A',
                    // *** FIX 8: ដក Proxy "images.weserv.nl" ចេញ ហើយប្រើ Link ដើម ***
                    photoUrl: cells[COL_INDEX.PHOTO]?.v || null,
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
            .filter(emp => emp.group === 'IT Support' && emp.photoUrl); // *** បន្ថែមលក្ខខណ្ឌ៖ ត្រូវតែមានរូបថត ***

        console.log(`Loaded ${allEmployees.length} employees (Filtered + Must have photo).`);
        
        if (allEmployees.length === 0) {
             showMessage('បញ្ហា', 'រកមិនឃើញបុគ្គលិក (IT Support) ដែលមានរូបថតទេ។ សូមទាក់ទង IT។', true);
             loadingText.textContent = 'Error';
             return;
        }
        
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
                 alt="
