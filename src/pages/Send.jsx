import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'react-qr-code';
import io from 'socket.io-client';
import './send.css';

const Send = () => {
  const [deviceId] = useState(`device-${uuidv4()}`);
  const [username] = useState('Sender');
  const [file, setFile] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState('Ready to send');

  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const dataChannelRef = useRef(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const backendUrl = import.meta.env.VITE_SERVER_URL; 
        const res = await fetch(`${backendUrl}/api/network-info`);
        const data = await res.json();

        const socket = io(backendUrl, {
          reconnectionAttempts: 5,
          withCredentials: true
        });
        socketRef.current = socket;

        socket.emit('register-device', { deviceId, username });
        socket.emit('get-devices');

        socket.on('active-devices', (deviceList) => {
          const filtered = deviceList.filter(d => d.deviceId !== deviceId);
          setDevices(filtered);
        });

        socket.on('file-request', async ({ fromDeviceId, fileName, fileSize, offer }) => {
          setStatus(`Incoming file: ${fileName}`);
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              {
                urls: 'turn:relay1.expressturn.com:3480',
                username: '000000002065517165',
                credential: 'ylaVjFtCwUP3O/vnBRsTa+mUpkY='
              }
            ]
          });
          pcRef.current = pc;

          pc.ondatachannel = (event) => {
            const channel = event.channel;
            const receivedChunks = [];
            channel.binaryType = 'arraybuffer';

            channel.onmessage = (e) => {
              receivedChunks.push(e.data);
              const total = receivedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
              const percent = Math.round((total / fileSize) * 100);
              setTransferProgress(percent);

              if (total >= fileSize) {
                const blob = new Blob(receivedChunks);
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                link.click();
                setStatus('File received');
              }
            };
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('ice-candidate', {
                toDeviceId: fromDeviceId,
                candidate: event.candidate
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('file-accepted', {
            toDeviceId: fromDeviceId,
            answer
          });
        });

        socket.on('file-accepted', async ({ answer }) => {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setStatus('Connection established - sending file...');
        });

        socket.on('ice-candidate', ({ candidate }) => {
          if (candidate && pcRef.current) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });
      } catch (err) {
        console.error(err);
        setStatus('Initialization error');
      }
    };

    initialize();

    return () => {
      socketRef.current?.disconnect();
      if (pcRef.current) pcRef.current.close();
    };
  }, [deviceId]);

  const handleSendFile = async () => {
    if (!file || !selectedDeviceId) return;

    setStatus('Initializing connection...');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:your-turn-server.com:3478',
          username: 'your-user',
          credential: 'your-password'
        }
      ]
    });
    pcRef.current = pc;

    const channel = pc.createDataChannel('file');
    dataChannelRef.current = channel;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          toDeviceId: selectedDeviceId,
          candidate: event.candidate
        });
      }
    };

    channel.onopen = () => {
      const chunkSize = 256 * 1024;
      const reader = new FileReader();
      let offset = 0;

      reader.onload = (e) => {
        const buffer = e.target.result;
        const sendChunk = () => {
          while (offset < buffer.byteLength) {
            if (channel.bufferedAmount > 4 * chunkSize) {
              setTimeout(sendChunk, 10);
              return;
            }
            const chunk = buffer.slice(offset, offset + chunkSize);
            channel.send(chunk);
            offset += chunkSize;
            const progress = Math.round((offset / buffer.byteLength) * 100);
            setTransferProgress(progress);
          }
          if (offset >= buffer.byteLength) {
            channel.close();
            setStatus('File transfer complete');
          }
        };
        sendChunk();
      };

      reader.readAsArrayBuffer(file);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current.emit('send-file-request', {
      toDeviceId: selectedDeviceId,
      fromDeviceId: deviceId,
      fileName: file.name,
      fileSize: file.size,
      offer
    });
  };

  return (
    <div className="send-container">
      <div className="containers">
        <div className="container1">
          <h1 className="send-title">DropMesh Sender</h1>
          <div className="status-section">
            <p className="status-label">Status: {status}</p>
            {transferProgress > 0 && (
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${transferProgress}%` }}></div>
                <span className="progress-label">{transferProgress}%</span>
              </div>
            )}
          </div>

          <div className="file-section">
            <label className="file-label">
              Select File
              <input
                type="file"
                onChange={(e) => setFile(e.target.files[0])}
                className="file-input"
              />
            </label>
          </div>

          <div className="receiver-section">
            <h2 className="receiver-title">Select Receiver</h2>
            {devices.length === 0 ? (
              <p className="progress-label">No devices found on network</p>
            ) : (
              <ul className="device-list">
                {devices.map((dev) => (
                  <li className="device-list-item" key={dev.deviceId}>
                    <button
                      className={`device-btn${selectedDeviceId === dev.deviceId ? ' selected' : ''}`}
                      onClick={() => setSelectedDeviceId(dev.deviceId)}
                    >
                      {dev.username} ({dev.deviceId.startsWith('mobile') ? 'Mobile' : 'Desktop'})
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="container2">
          <div className="qr-section">
            <div className="qr-image">
              <QRCode
                value={window.location.origin} 
                size={200}
                level="H"
              />
            </div>
            <p className="qr-hint">
              Scan this on mobile device<br />to open DropMesh
            </p>
          </div>

          <button
            className="send-btn"
            onClick={handleSendFile}
            disabled={!file || !selectedDeviceId}
          >
            Send File
          </button>
        </div>
      </div>
    </div>
  );
};

export default Send;
