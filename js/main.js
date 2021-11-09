const videoElement = document.querySelector('video');
const videoSelect = document.querySelector('select#videoSource');
const startProcessingButton = document.getElementById('processButton');
const selectors = [videoSelect];

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === 'videoinput') {
      option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    } else {
      console.log('Some other kind of source/device: ', deviceInfo);
    }
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}

navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

function handleError(error) {
  console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

let streaming = false;
let stream = null;
let vc = null;
let width = 0;
let height=0;


function start() {
  if (window.stream) {
    window.stream.getTracks().forEach(track => {
      track.stop();
    });
  }
  const videoSource = videoSelect.value;
  const constraints = {
    audio: false,
    video: {deviceId: videoSource ? {exact: videoSource} : undefined}
  };
  navigator.mediaDevices.getUserMedia(constraints)
  navigator.mediaDevices.getUserMedia(constraints)
  .then(function(s){
    window.stream=s;
    videoElement.srcObject=s;
    videoElement.play();
    return navigator.mediaDevices.enumerateDevices();
  })
  .then(gotDevices)
  .catch(handleError);
  videoElement.addEventListener("canplay", function(ev){
    if (!streaming) {
      width = videoElement.clientWidth;
      height = videoElement.clientHeight / (videoElement.clientWidth/width);
      videoElement.setAttribute("width", width);
      videoElement.setAttribute("height", height);
      streaming = true;
      vc = new cv.VideoCapture(videoElement);
    }
  }, false);
}

videoSelect.onchange = start;

start();

startProcessingButton.onclick= function(){
  videoSelect.disabled = true;
  startVideoProcessing();
}

let lastFilter = '';
let src = null;
let dstC1 = null;
let dstC3 = null;
let dstC4 = null;
let previousFilter = null; 
let filtersArray = [];

function startVideoProcessing() {
  if (!streaming) { 
    console.warn("Please startup your webcam"); 
    return;
  }
  stopVideoProcessing();
  src = new cv.Mat(height, width, cv.CV_8UC4);
  dstC1 = new cv.Mat(height, width, cv.CV_8UC1);
  dstC3 = new cv.Mat(height, width, cv.CV_8UC3);
  dstC4 = new cv.Mat(height, width, cv.CV_8UC4);
  previousFilter = src;
  requestAnimationFrame(processVideo);
}

function passThrough(src) {
  return src;
}

function gray(src) {
  cv.cvtColor(src, dstC1, cv.COLOR_RGBA2GRAY);
  return dstC1;
}

function gaussianBlur(src) {
  cv.GaussianBlur(src, dstC4, {width: controls.gaussianBlurSize, height: controls.gaussianBlurSize}, 0, 0, cv.BORDER_DEFAULT);
  return dstC4;
}

function threshold(src) {
  cv.threshold(src, dstC4, controls.thresholdValue, 200, cv.THRESH_BINARY);
  return dstC4;
}

function superposeFilters(newFilter){
  if (newFilter== 'passThrough') {
    filtersArray = ['passThrough']; 
    previousFilter = src;
    console.log('here')
    applyFilterCombination(filtersArray)
  }
      
  if(filtersArray.includes(newFilter)){
    let filterIndex = filtersArray.indexOf(newFilter);
    filtersArray.splice(filterIndex,1);
    applyFilterCombination(filtersArray);
  }
  else{
    filtersArray.push(newFilter);
    applyFilterCombination(filtersArray);
    console.log(filtersArray)
  }
}

function applyFilterCombination(filtersArray){
  
  filtersArray.forEach(val => {
    switch(val){
      case 'passThrough': previousFilter = passThrough(previousFilter); break;
      case 'gray':  previousFilter = gray(previousFilter); break;
      case 'gaussianBlur':  previousFilter = gaussianBlur(previousFilter); break;
      case 'threshold': previousFilter = threshold(previousFilter); break;
    }
    console.log(previousFilter);
  });
}

function processVideo() {
  stats.begin();
  vc.read(src);
  let result;
  switch (controls.filter) {
    case 'passThrough': superposeFilters('passThrough'); break;
    case 'gray': superposeFilters('gray'); break;
    case 'gaussianBlur': superposeFilters('gaussianBlur'); break;
    case 'threshold': superposeFilters('threshold'); break;
    default: superposeFilters('passThrough');
  }
  
  cv.imshow("canvasOutput", previousFilter);
  stats.end();
  lastFilter = controls.filter;
  requestAnimationFrame(processVideo);
}

function stopVideoProcessing() {
  if (src != null && !src.isDeleted()) src.delete();
  if (dstC1 != null && !dstC1.isDeleted()) dstC1.delete();
  if (dstC4 != null && !dstC4.isDeleted()) dstC4.delete();
}

var stats = null;

var filters = {
  'passThrough': 'Pass Through',
  'gaussianBlur': 'Gaussian Blurring',
  'gray': 'Gray',
  'threshold': 'Threshold',
};

var filterName = document.getElementById('filterName');

var controls;

function initUI() {
  stats = new Stats();
  stats.showPanel(0);
  document.getElementById('container').appendChild(stats.domElement);

  controls = {
    filter: 'passThrough',
    setFilter: function(filter) {
      this.filter = filter;
      filterName.innerHTML = filters[filter];
    },
    passThrough: function() { this.setFilter('passThrough'); },
    gaussianBlur: function() { this.setFilter('gaussianBlur'); },
    gaussianBlurSize: 7,
    gray: function() { this.setFilter('gray'); },
    threshold: function() { this.setFilter('threshold'); },
    thresholdValue: 100,
  };
  
  let gui = new dat.GUI({ autoPlace: false });
  let guiContainer = document.getElementById('guiContainer');
  guiContainer.appendChild(gui.domElement);
  
  let lastFolder = null;
  function closeLastFolder(folder) {
    if (lastFolder != null && lastFolder != folder) {
      lastFolder.close();
    }
    lastFolder = folder;
  }
  
  let passThrough = gui.add(controls, 'passThrough').name(filters['passThrough']).onChange(function() {
    closeLastFolder(null);
  });

  let colorConversion = gui.addFolder('Color Conversion');
  colorConversion.add(controls, 'gray').name(filters['gray']).onChange(function() {
    closeLastFolder(null);
  });
  
  let gaussianBlur = gui.addFolder(filters['gaussianBlur']);
  gaussianBlur.domElement.onclick = function() {
    closeLastFolder(gaussianBlur);
    controls.gaussianBlur();
  };
  gaussianBlur.add(controls, 'gaussianBlurSize', 7, 99, 1).name('kernel size').onChange(function(value) { if (value % 2 === 0) controls.gaussianBlurSize = value + 1;});
  
  let threshold = gui.addFolder('Thresholding');
  
  threshold.domElement.onclick = function() {
    closeLastFolder(threshold);
    controls.threshold();
  };
  threshold.add(controls, 'thresholdValue', 0, 200, 1).name('threshold value');  
}

function opencvIsReady() {
  console.log('OpenCV.js is ready');
  initUI();
  start();
}