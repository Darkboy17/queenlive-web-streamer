import io from 'socket.io-client';

const URL = 'http://localhost:5000'; // or env variable

const socket = io(URL, { autoConnect: true });

export default socket;
