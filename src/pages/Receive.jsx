import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import io from 'socket.io-client';
import './receive.css';

const Receive = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const [networkInfo, setNetworkInfo] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const [fileInfo, setFileInfo] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [progress, setProgress] = useState(0);
  
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const receivedChunks = useRef([]);
  const totalBytesReceived = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus("No session ID provided");
      return;
    }

    const initializeConnection = async () => {
      try {
        setStatus("Finding server...");
        const backendHost = window.location.hostname;
        const res = await fetch(`http://${backendHost}:3000/api/network-info`);
        const data = await res.json();
        setNetworkInfo(data);

        const socket = io(`http://${data.ip}:3000`, {
          reconnectionAttempts: 5,
          withCredentials: true
        });
        socketRef.current = socket;

        const deviceId = `mobile-${sessionId}`;
        socket.emit('register-device', { 
          deviceId, 
          username: 'Mobile Receiver',
          isMobile: true 
        });

        socket.emit('join-session', { sessionId, deviceId });

        socket.on('file-request', async ({ offer, fileName, fileSize, fromDeviceId }) => {
          setStatus(`Receiving: ${fileName}`);
          setFileInfo({ fileName, fileSize });
          setProgress(0);
          receivedChunks.current = [];
          totalBytesReceived.current = 0;

          // 1. Create peer connection
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pcRef.current = pc;

          // 2. Set up data channel handler
          pc.ondatachannel = (event) => {
            const channel = event.channel;
            channel.binaryType = 'arraybuffer';

            channel.onmessage = (e) => {
              receivedChunks.current.push(e.data);
              totalBytesReceived.current += e.data.byteLength;
              if (fileInfo && fileInfo.fileSize) {
                setProgress(Math.round((totalBytesReceived.current / fileInfo.fileSize) * 100));
              }
            };

            channel.onclose = () => {
              const blob = new Blob(receivedChunks.current);
              setDownloadUrl(URL.createObjectURL(blob));
              setStatus('File received!');
              setProgress(100);
            };

            channel.onerror = (err) => {
              setStatus('Data channel error');
              console.error('Data channel error:', err);
            };
          };

          // 3. Handle ICE candidates
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('ice-candidate', {
                toDeviceId: fromDeviceId,
                candidate: event.candidate
              });
            }
          };

          // 4. Set remote offer and create answer
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // 5. Send answer back to sender
          socket.emit('file-accepted', {
            toDeviceId: fromDeviceId,
            answer: pc.localDescription
          });
        });

        socket.on('ice-candidate', ({ candidate }) => {
          if (candidate && pcRef.current) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
              .catch(e => console.error("ICE candidate error:", e));
          }
        });

        setStatus("Ready to receive files");

      } catch (error) {
        console.error("Initialization error:", error);
        setStatus("Failed to connect");
      }
    };

    initializeConnection();

    return () => {
      socketRef.current?.disconnect();
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return (
    <div className="receive-container">
      <h1 className="receive-title">DropMesh Receiver</h1>
      
      <div className="status-section">
        <p className="status-label">Status: {status}</p>
        {progress > 0 && progress < 100 && (
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            ></div>
            <span className="progress-label">{progress}%</span>
          </div>
        )}
        {progress === 100 && (
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill complete"
              style={{ width: `100%` }}
            ></div>
            <span className="progress-label complete">100%</span>
          </div>
        )}
      </div>

      {fileInfo && (
        <div className="file-info-section">
          <h2 className="file-info-title">Incoming File:</h2>
          <p className="file-info-name">{fileInfo.fileName}</p>
          <p className="file-info-size">
            {(fileInfo.fileSize / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download={fileInfo?.fileName || "received_file"}
          className="download-link"
        >
          Download File
        </a>
      )}
    </div>
  );
};

export default Receive;