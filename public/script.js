const socket = io('/')
const videoGrid = document.getElementById('video-grid')

// Generate a random user ID between 1 and 100000
function generateRandomUserId() {
  return Math.floor(Math.random() * 100000) + 1;
}

const userId = generateRandomUserId();
const myPeer = new Peer(userId.toString(), {
  host: '/',
  port: '3001'
})



const urlParams = new URLSearchParams(window.location.search)
const mode = urlParams.get('mode')
const peers = {}
const videoElements = []

const myVideo = document.createElement('video')
myVideo.muted = true

// Add leave call button functionality
const leaveCallBtn = document.getElementById('leaveCallBtn')
let hasLeft = false

// Function to handle leaving the call
function leaveCall() {
  if (hasLeft) return
  
  hasLeft = true
  
  // Close all peer connections
  Object.values(peers).forEach(call => {
    if (call) call.close()
  })
  
  // Stop all tracks from my stream
  if (myVideo.srcObject) {
    const tracks = myVideo.srcObject.getTracks()
    tracks.forEach(track => track.stop())
  }
  
  // Clear video grid
  videoGrid.innerHTML = ''
  
  // Emit disconnect event to server
  socket.emit('disconnect-user')
  
  // Close peer connection
  myPeer.destroy()
  
  // Show goodbye section
  showGoodbyeSection()
}

// Function to show goodbye section
function showGoodbyeSection() {
  // Hide the video grid and main controls
  document.getElementById('video-grid').style.display = 'none'
  document.querySelector('.main-controls').style.display = 'none'
  
  // Create and show goodbye section
  const container = document.querySelector('.container')
  const goodbyeSection = document.createElement('div')
  goodbyeSection.className = 'goodbye-section'
  goodbyeSection.innerHTML = `
    <h2>Thanks for joining the call!</h2>
    <p>You have successfully left the meeting.</p>
    <button id="returnHomeBtn" class="btn">Return to Home</button>
  `
  container.appendChild(goodbyeSection)
  
  // Add event listener to return home button
  document.getElementById('returnHomeBtn').addEventListener('click', () => {
    window.location.href = '/'
  })
}

// Listen for leave call button click
leaveCallBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave this call?')) {
    leaveCall()
  }
})

const shouldStreamVideo = mode !== 'view-only' // Add a condition to check if the user should stream video

if (shouldStreamVideo) {
  navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  }).then(stream => {
    addVideoStream(myVideo, stream)

    myPeer.on('call', call => {
      call.answer(stream)
      call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream)
      })
    })

    socket.on('user-connected', userId => {
      connectToNewUser(userId, stream)
    })
  }).catch(error => {
    console.error('Error accessing display media.', error)
  })
} else {
  myPeer.on('call', call => {
    call.answer() // Answer the call without sending any stream
    const video = document.createElement('video')
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream)
    })
  })

  socket.on('user-connected', userId => {
    connectToNewUser(userId)
  })
}

socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close()
})

// Modified event handler for peer open event
myPeer.on('open', id => {
  console.log('My peer ID is: ' + id);
  socket.emit('join-room', ROOM_ID, id)
})

function connectToNewUser(userId, stream) {
  let call;
  if (stream) {
    call = myPeer.call(userId, stream);
  } else {
    call = myPeer.call(userId);
  }

  if (call) {
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
    call.on('close', () => {
      video.remove();
    });

    peers[userId] = call;
  } else {
    console.error('Failed to create a call object.');
  }
}

function addVideoStream(video, stream) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    video.play().catch(error => {
      console.log('Autoplay prevented:', error)
      videoElements.push(video)
    })
  })
  videoGrid.append(video)

  // Add an event listener to handle when the stream ends
  stream.getTracks().forEach(track => {
    track.addEventListener('ended', () => {
      video.srcObject = null
      video.style.display = 'none'
      video.width = 0
      video.height = 0
    })
  })
}

// Add an event listener for user interaction to play the videos
document.addEventListener('click', () => {
  videoElements.forEach(video => video.play())
  videoElements.length = 0 // Clear the array after playing the videos
})