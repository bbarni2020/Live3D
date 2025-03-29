const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
const { PeerServer } = require('peer')

const peerServer = PeerServer({ port: 3001, path: '/' })

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  console.log('Redirecting to a new room')
  res.render('room', { roomId: 'live' })
})

app.get('/:room', (req, res) => {
  console.log(`Rendering room with ID: ${req.params.room}`)
  res.render('room', { roomId: 'live' })
})

io.on('connection', socket => {
  console.log('New connection established')

  socket.on('join-room', (roomId, userId) => {
    console.log(`User ${userId} joined room ${roomId}`)
    socket.join(roomId)
    socket.to(roomId).emit('user-connected', userId)

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from room ${roomId}`)
      socket.to(roomId).emit('user-disconnected', userId)
    })
  })
})

server.listen(3000, () => {
  console.log('Server is running on port 3000')
})