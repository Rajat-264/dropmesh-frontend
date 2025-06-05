import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'react-qr-code';
import io from 'socket.io-client';
import './send.css';

const Send = () => {
  const [deviceId] = useState(`sender-${uuidv4()}`);
  const [username] = useState("Sender");
  const [file, setFile] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [sessionId] = useState(uuidv4());
  const [mobileJoined, setMobileJoined] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState("Ready to send");
  
  const dataChannelRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const initializeConnection = async () => {
      try {
        setStatus("Connecting to server...");
        const res = await fetch('http://localhost:3000/api/network-info');
        const data = await res.json();
        setNetworkInfo(data);

        const socket = io(`http://${data.ip}:3000`, {
          reconnectionAttempts: 5,
          withCredentials: true
        });
        socketRef.current = socket;

        socket.emit('register-device', { 
          deviceId, 
          username, 
          isMobile: false 
        });

        socket.emit('get-devices');

        socket.on('active-devices', (deviceList) => {
          const filtered = deviceList.filter(d => d.deviceId !== deviceId);
          setDevices(filtered);
          
          // Check if mobile has joined
          const mobileDevice = filtered.find(d => 
            d.deviceId === `mobile-${sessionId}`
          );
          if (mobileDevice) {
            setMobileJoined(true);
          }
        });

        socket.on('mobile-joined', ({ sessionId: joinedSession }) => {
          if (joinedSession === sessionId) {
            setMobileJoined(true);
            setStatus("Mobile device connected");
          }
        });

        socket.on('file-accepted', async ({ answer }) => {
          try {
            await pcRef.current.setRemoteDescription(
              new window.RTCSessionDescription(answer)
            );
            setStatus("Connection established - sending file...");
          } catch (error) {
            console.error("Error setting remote description:", error);
            setStatus("Connection error");
          }
        });

        socket.on('ice-candidate', ({ candidate }) => {
          if (candidate && pcRef.current) {
            pcRef.current.addIceCandidate(new window.RTCIceCandidate(candidate))
              .catch(e => console.error("Error adding ICE candidate:", e));
          }
        });

        socket.on('connect_error', (error) => {
          console.error("Socket connection error:", error);
          setStatus("Connection failed - retrying...");
        });

        setStatus("Connected to server");

      } catch (error) {
        console.error("Initialization error:", error);
        setStatus("Failed to initialize connection");
      }
    };

    initializeConnection();
    return () => {
      socketRef.current?.disconnect();
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [deviceId, username, sessionId]);

  const handleSendFile = async () => {
    if (!file || !selectedDeviceId) return;

    try {
      setStatus("Initializing connection...");
      const pc = new window.RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
        setStatus(`Sending ${file.name}...`);
        const chunkSize = 16 * 1024; // 16KB chunks
        const reader = new FileReader();
        let offset = 0;

        reader.onload = (e) => {
          const sendChunk = () => {
            if (offset >= e.target.result.byteLength) {
              channel.close();
              return;
            }

            const chunk = e.target.result.slice(offset, offset + chunkSize);
            channel.send(chunk);
            offset += chunkSize;

            const progress = Math.round((offset / e.target.result.byteLength) * 100);
            setTransferProgress(progress);

            if (offset < e.target.result.byteLength) {
              setTimeout(sendChunk, 0); // Prevent UI blocking
            }
          };

          sendChunk();
        };

        reader.readAsArrayBuffer(file);
      };

      channel.onclose = () => {
        setStatus("File transfer complete");
        setTransferProgress(100);
      };

      channel.onerror = (error) => {
        console.error("Data channel error:", error);
        setStatus("Transfer error");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current.emit('send-file-request', {
        toDeviceId: selectedDeviceId,
        fromDeviceId: deviceId,
        fileName: file.name,
        fileSize: file.size,
        sessionId,
        offer: pc.localDescription
      });

    } catch (error) {
      console.error("Error sending file:", error);
      setStatus("Failed to initiate transfer");
    }
  };

  return (
    <div className="send-container">
      <div className="containers">
      <div className="container1">
      <h1 className="send-title">DropMesh Sender</h1>
      
      <div className="status-section">
        <p className="status-label">Status: {status}</p>
        {transferProgress > 0 && transferProgress < 100 && (
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${transferProgress}%` }}
            ></div>
            <span className="progress-label">{transferProgress}%</span>
          </div>
        )}
        {transferProgress === 100 && (
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill complete"
              style={{ width: `100%` }}
            ></div>
            <span className="progress-label complete">100%</span>
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
                  className={`device-btn${selectedDeviceId === dev.deviceId ? " selected" : ""}`}
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
        {networkInfo ? (
          <>
            <div className="qr-image">
              <QRCode 
                value={`http://${networkInfo.ip}:5173/receive?session=${sessionId}`}
                size={200}
                level="H"
              />
            </div>
            <p className="qr-hint">
              Scan this on mobile device<br /> 
              to receive file
            </p>
            {mobileJoined && (
              <p className="qr-connected">
                Mobile device connected ✅
              </p>
            )}
          </>
        ) : (
          <p>Loading QR code...</p>
        )}
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