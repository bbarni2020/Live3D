const socket = io('/')
const videoGrid = document.getElementById('video-grid')

function generateRandomUserId() {
  return Math.floor(Math.random() * 100000) + 1;
}

const userId = generateRandomUserId();
const myPeer = new Peer(userId.toString(), {
  host: '/',
  port: '3001'
})

const activePeers = {}
const PEER_TIMEOUT = 10000
const USER_CHECK_INTERVAL = 15000

const urlParams = new URLSearchParams(window.location.search)
const mode = urlParams.get('mode')
const peers = {}
const videoElements = []

const myVideo = document.createElement('video')
myVideo.muted = true
if (mode === 'view-only') {
  myVideo.setAttribute('data-peer-id', userId.toString())
}

const leaveCallBtn = document.getElementById('leaveCallBtn')
let hasLeft = false

function leaveCall() {
  if (hasLeft) return
  
  hasLeft = true
  
  Object.values(peers).forEach(call => {
    if (call) call.close()
  })
  
  if (myVideo.srcObject) {
    const tracks = myVideo.srcObject.getTracks()
    tracks.forEach(track => track.stop())
  }
  
  videoGrid.innerHTML = ''
  
  socket.emit('disconnect-user')
  
  myPeer.destroy()
  
  showGoodbyeSection()
}

function showGoodbyeSection() {
  document.getElementById('video-grid').style.display = 'none'
  document.querySelector('.main-controls').style.display = 'none'
  
  const container = document.querySelector('.container')
  const goodbyeSection = document.createElement('div')
  goodbyeSection.className = 'goodbye-section'
  goodbyeSection.innerHTML = `
    <h2>Thanks for joining the call!</h2>
    <p>You have successfully left the meeting.</p>
    <button id="returnHomeBtn" class="btn">Return to Home</button>
  `
  container.appendChild(goodbyeSection)
  
  document.getElementById('returnHomeBtn').addEventListener('click', () => {
    window.location.href = '/'
  })
}

leaveCallBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave this call?')) {
    leaveCall()
  }
})

const shouldStreamVideo = mode !== 'view-only'

if (shouldStreamVideo) {
  navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  }).then(stream => {
    addVideoStream(myVideo, stream)

    myPeer.on('call', call => {
      call.answer(stream)
      const video = document.createElement('video')
      const callerId = call.peer
      video.setAttribute('data-peer-id', callerId)
      call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, callerId)
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
    call.answer()
    const video = document.createElement('video')
    const callerId = call.peer
    video.setAttribute('data-peer-id', callerId)
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream, callerId)
    })
    activePeers[callerId] = Date.now()
  })

  socket.on('user-connected', userId => {
    connectToNewUser(userId)
    activePeers[userId] = Date.now()
  })
}

socket.on('user-disconnected', userId => {
  removePeer(userId)
})

function startHeartbeat() {
  setInterval(() => {
    socket.emit('heartbeat', ROOM_ID, userId.toString())
  }, 5000)
  
  setInterval(checkActivePeers, 10000)
  
  setInterval(verifyConnectedUsers, USER_CHECK_INTERVAL)
}

async function verifyConnectedUsers() {
  if (mode !== 'view-only') {
    console.log('Not in view-only mode, skipping user verification');
    return;
  }
  
  try {
    const response = await fetch(`/api/users/${ROOM_ID}`)
    if (!response.ok) {
      console.error('Failed to fetch users from API:', response.status)
      return
    }
    
    const data = await response.json()
    const serverUsers = data.users || []
    
    activePeers[userId.toString()] = Date.now()
    
    const videoGridUsers = countVideoGridUsers()
    
    console.log('My peer ID is:', userId.toString())
    console.log('Server users:', serverUsers)
    console.log('Video grid users:', videoGridUsers)
    console.log('Local activePeers:', Object.keys(activePeers))
    
    let missingUsers = false
    
    const knownPeerIds = Object.keys(activePeers).filter(id => id !== userId.toString())
    
    const serverUsersList = serverUsers.filter(id => id !== userId.toString())
    
    for (const serverId of serverUsersList) {
      if (!knownPeerIds.includes(serverId)) {
        console.log(`Missing connection to user ${serverId} that server knows about`)
        missingUsers = true
        reloadPage()
        break
      }
    }
    
    for (const peerId of knownPeerIds) {
      if (!serverUsersList.includes(peerId)) {
        console.log(`We have connection to ${peerId} but server doesn't list them - might be stale`)
        missingUsers = true
        reloadPage()
        break
      }
    }
    
    if (missingUsers) {
      console.log('Connection mismatch detected! Reloading page to sync connections...')
      reloadPage()
    } else {
      console.log('All users properly connected')
    }
  } catch (error) {
    console.error('Error verifying connected users:', error)
  }
}

function checkActivePeers() {
  const currentTime = Date.now()
  
  Object.keys(activePeers).forEach(peerId => {
    const lastActivity = activePeers[peerId]
    
    if (currentTime - lastActivity > PEER_TIMEOUT) {
      console.log(`Peer ${peerId} appears to be disconnected, removing...`)
      removePeer(peerId)
    }
  })
}

function removePeer(peerId) {
  if (peers[peerId]) {
    peers[peerId].close()
    delete peers[peerId]
  }
  
  const videoElement = document.querySelector(`[data-peer-id="${peerId}"]`)
  if (videoElement) {
    videoElement.remove()
  }
  
  delete activePeers[peerId]
}

socket.on('heartbeat-response', userId => {
  activePeers[userId] = Date.now()
})

myPeer.on('open', id => {
  console.log('My peer ID is: ' + id);
  socket.emit('join-room', ROOM_ID, id)
  startHeartbeat()
})

function connectToNewUser(userId, stream) {
  console.log(`Attempting to connect to user: ${userId}, with stream: ${stream ? 'yes' : 'no'}`);
  
  let call = null;
  try {
    if (stream) {
      call = myPeer.call(userId, stream);
    } else {
      console.log(`View-only mode: waiting for user ${userId} to send their stream`);
      activePeers[userId] = Date.now();
      return;
    }
  } catch (error) {
    console.error('Error calling peer:', error);
  }

  if (call) {
    const video = document.createElement('video');
    video.setAttribute('data-peer-id', userId);
    
    call.on('stream', userVideoStream => {
      console.log(`Received stream from user ${userId}`);
      addVideoStream(video, userVideoStream, userId);
    });
    
    call.on('close', () => {
      console.log(`Call with user ${userId} closed`);
      video.remove();
      delete activePeers[userId];
    });
    
    call.on('error', (err) => {
      console.error(`Call error with user ${userId}:`, err);
      video.remove();
      delete activePeers[userId];
    });

    peers[userId] = call;
  } else {
    console.error(`Failed to create a call object for user ${userId}`);
  }
}

function addVideoStream(video, stream, peerId) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    video.play().catch(error => {
      console.log('Autoplay prevented:', error)
      videoElements.push(video)
    })
  })
  videoGrid.append(video)

  if (peerId && !video.hasAttribute('data-peer-id')) {
    video.setAttribute('data-peer-id', peerId)
  }
  
  const videoPeerId = video.getAttribute('data-peer-id')
  if (videoPeerId) {
    activePeers[videoPeerId] = Date.now()
    console.log(`Added/updated peer ${videoPeerId} to active peers from video stream`)
  }

  stream.getTracks().forEach(track => {
    track.addEventListener('ended', () => {
      video.srcObject = null
      video.style.display = 'none'
      video.width = 0
      video.height = 0
    })
  })
}

document.addEventListener('click', () => {
  videoElements.forEach(video => video.play())
  videoElements.length = 0
})

function reloadPage(forceReload = true) {
  console.log('Reloading page...')
  window.location.reload(forceReload)
}

function countVideoGridUsers() {
  const videoElements = videoGrid.querySelectorAll('video[data-peer-id]')
  const peerIds = Array.from(videoElements).map(video => video.getAttribute('data-peer-id'))
  
  console.log(`Found ${peerIds.length} video elements with peer IDs in grid`)
  
  peerIds.forEach(id => {
    if (id) {
      activePeers[id] = Date.now()
    }
  })
  
  return peerIds
}