const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
const { PeerServer } = require('peer')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(__dirname, 'userEvents.db')
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logWithTimestamp(`Error opening database: ${err.message}`)
  } else {
    logWithTimestamp('Connected to the user events database')
    
    db.run(`CREATE TABLE IF NOT EXISTS user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      roomId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        logWithTimestamp(`Error creating table: ${err.message}`)
      } else {
        logWithTimestamp('User events table ready')
      }
    })
  }
})

const logUserEvent = (userId, roomId, eventType) => {
  if (!userId.toString().startsWith('vo')) {
    const stmt = db.prepare(`INSERT INTO user_events (userId, roomId, eventType) VALUES (?, ?, ?)`)
    stmt.run(userId, roomId, eventType, (err) => {
      if (err) {
        logWithTimestamp(`Error logging user event: ${err.message}`)
      }
    })
    stmt.finalize()
  } else {
    logWithTimestamp(`Skipping database logging for virtual observer: ${userId}`)
  }
}

const peerServer = PeerServer({ port: 3001, path: '/' })

const logWithTimestamp = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

app.set('view engine', 'ejs')
app.use(express.static('public'))

const connectedUsers = {}

app.use(express.json())

app.get('/', (req, res) => {
  logWithTimestamp('Redirecting to a new room')
  res.render('room', { roomId: 'live' })
})

app.get('/:room', (req, res) => {
  logWithTimestamp(`Rendering room with ID: ${req.params.room}`)
  res.render('room', { roomId: 'live' })
})

app.get('/api/users/:room', (req, res) => {
  const roomId = req.params.room
  logWithTimestamp(`API request for users in room: ${roomId}`)
  
  if (!connectedUsers[roomId]) {
    return res.json({ users: [] })
  }
  
  res.json({ users: connectedUsers[roomId] })
})

io.on('connection', socket => {
  logWithTimestamp('New connection established')

  socket.on('join-room', (roomId, userId) => {
    logWithTimestamp(`User ${userId} joined room ${roomId}`)
    
    logUserEvent(userId, roomId, 'join')
    
    if (!connectedUsers[roomId]) {
      connectedUsers[roomId] = []
    }
    
    if (!connectedUsers[roomId].includes(userId)) {
      connectedUsers[roomId].push(userId)
    }
    
    socket.join(roomId)
    socket.to(roomId).emit('user-connected', userId)

    socket.on('disconnect', () => {
      logWithTimestamp(`User ${userId} disconnected from room ${roomId}`)
      
      logUserEvent(userId, roomId, 'disconnect')
      
      if (connectedUsers[roomId]) {
        const index = connectedUsers[roomId].indexOf(userId)
        if (index !== -1) {
          connectedUsers[roomId].splice(index, 1)
        }
      }
      
      socket.to(roomId).emit('user-disconnected', userId)
    })
  })
})

server.listen(3000, () => {
  logWithTimestamp('Server is running on port 3000')
})

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      logWithTimestamp(`Error closing database: ${err.message}`)
    } else {
      logWithTimestamp('Database connection closed')
    }
    process.exit(0)
  })
})