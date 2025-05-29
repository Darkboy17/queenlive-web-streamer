import { useRef, useEffect, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import AgoraRTC from "agora-rtc-sdk-ng";
import socket from './socket/socket';

import type {
    IAgoraRTCClient,
    ICameraVideoTrack,
    IMicrophoneAudioTrack,
    ClientRole
} from "agora-rtc-sdk-ng";


type Role = 'host' | 'audience';

const appId = import.meta.env.VITE_AGORA_APP_ID;
const channel = import.meta.env.VITE_AGORA_CHANNEL || 'queenlive';


const generateUid = () => {
    return Math.floor(Math.random() * 1000000000); // 9-digit number (Agora accepts up to 32-bit int)
};

const AgoraClient = () => {
    const clientRef = useRef<IAgoraRTCClient | null>(null);
    const videoContainerRef = useRef<HTMLDivElement | null>(null); // 👈 New ref for video container
    const uid = 2882341273; //generateUid();
    const [username, setUsername] = useState<string>(''); // Default username based on UID
    const streamId = uid.toString(); // Use the channel as the stream ID

    const [converterId, setConverterId] = useState('');
    const [videoStarted, setVideoStarted] = useState(false);

    const [joined, setJoined] = useState(false);
    const [youtubeLink, setYoutubeLink] = useState('');
    const [isHost, setIshost] = useState(false);
    const [loading, setLoading] = useState(false);

    const [audienceID, setAudienceId] = useState<number>(generateUid());


    const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

    useEffect(() => {
        const client = AgoraRTC.createClient({ mode: "live", codec: "h264" });
        clientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);

            if (mediaType === "video") {
                const remoteContainer = document.createElement("div");
                remoteContainer.id = audienceID.toString(); // 👈 Set unique ID for remote user
                remoteContainer.className = `
      w-full aspect-video
      rounded-lg overflow-hidden
      relative min-w-[320px] min-h-[180px]
    `;
                remoteContainer.style.width = "640px";
                remoteContainer.style.height = "480px";
                remoteContainer.textContent = `Audience UID: ${remoteContainer.id}`;
                videoContainerRef.current?.append(remoteContainer); // 👈 Append to container
                user.videoTrack?.play(remoteContainer);
                setVideoStarted(true); // ✅ Video started (audience)
            }

            if (mediaType === "audio") {
                user.audioTrack?.play();
            }
        });

        client.on("user-unpublished", (user) => {
            if (user.videoTrack) user.videoTrack.stop();
            if (user.audioTrack) user.audioTrack.stop();
            const remoteEl = document.getElementById(user.uid.toString());
            remoteEl?.remove();
        });

        return () => {
            (async () => {
                await client.leave();
            })();
        };

    }, []);


    const startYoutubeStream = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:5000/orchestrate/start-youtube-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ streamId })
            });

            const data = await response.json();
            setConverterId(data.converterId);
            setYoutubeLink(data.youtubeLink);
        } catch (error) {
            console.error("Failed to start YouTube stream:", error);
        } finally {
            setLoading(false);
        }
    };


    const stopRtmpPush = async (converterId: string) => {
        setLoading(true);
        await fetch('http://localhost:5000/stop-rtmp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ converterId })
        });
        console.log('RTMP push stopped');
        setLoading(false);
        setConverterId('');
        setYoutubeLink('');
    };

    const joinChannel = async (role: Role) => {
        try {
            const client = clientRef.current;
            if (!client) return;

            setIshost(role === 'host');

            const userRole: ClientRole = role === 'host' ? 'host' : 'audience';
            const userUID: number = role === 'host' ? uid : audienceID;
            if (role === 'host') setUsername(`Host`); // Set username based on UID
            else setUsername(`User ${userUID}`); // Set username for audience

            const tokenRes = await fetch(`http://localhost:5000/token/rtc?channel=${channel}&uid=${userUID}&role=${role}`);
            const data = await tokenRes.json();

            console.log("token", data.token);

            await client.join(appId, channel, data.token, userUID);
            client.setClientRole(userRole);

            if (role === 'host') {
                const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                const videoTrack = await AgoraRTC.createCameraVideoTrack();

                localAudioTrackRef.current = audioTrack;
                localVideoTrackRef.current = videoTrack;

                await client.publish([audioTrack, videoTrack]);

                const localContainer = document.createElement("div");
                localContainer.textContent = `You (Host) UID: ${userUID}`;
                localContainer.id = uid.toString();


                localContainer.style.width = "640px";
                localContainer.style.height = "480px";

                videoContainerRef.current?.append(localContainer); // 👈 Append to container
                videoTrack.play(localContainer);

                setVideoStarted(true);          // add this line

            }

            console.log(`Joined as ${role}`);
            setJoined(true);
        } catch (err) {
            console.error(`Failed to join as ${role}:`, err);
        }
    };

    const leaveChannel = async () => {
        const client = clientRef.current;
        if (!client) return;

        localAudioTrackRef.current?.close();
        localVideoTrackRef.current?.close();

        const localEl = document.getElementById(uid.toString());
        localEl?.remove();

        client.remoteUsers.forEach((user) => {
            const remoteEl = document.getElementById(user.uid.toString());
            remoteEl?.remove();
        });

        await client.leave();
        console.log("Left channel");
        setJoined(false);
        setVideoStarted(false);
        if (isHost) socket.emit('clearChat', { streamId });   // <── tell server to wipe
    };

    return (
        <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col items-center justify-center p-1">
            <h2 className="text-3xl font-bold mb-1">Queenlive Web App</h2>

            <div className="flex flex-row justify-center mb-6">
                <div className={`flex flex-col items-center justify-center w-full max-w-4xl ${joined ? 'flex-row-reverse' : 'flex-col'}`}>
                    {/* 👇 Video container */}
                    <div
                        ref={videoContainerRef}
                        className={`flex flex-wrap gap-4 justify-center items-center border border-gray-300 p-7 rounded-md shadow-sm bg-white transition-all duration-300 ${joined ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 overflow-hidden'
                            }`}
                    />

                    <div className="flex flex-col gap-2 mb-2">
                        {!joined &&
                            <button
                                onClick={() => joinChannel('host')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl shadow"
                            >
                                🎤 Join as Host
                            </button>
                        }
                        {!joined && <button
                            onClick={() => joinChannel('audience')}
                            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-xl shadow"
                        >
                            👀 Join as Audience
                        </button>}
                        <div className="mt-2 flex flex-row gap-1 justify-center items-center">
                            {joined && <button
                                onClick={leaveChannel}
                                className={` bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-xl shadow
                            ${!joined ? "w-full" : ""} `}
                            >
                                🚪 Leave
                            </button>}
                            {joined && isHost && (
                                <>
                                    <button
                                        disabled={loading || Boolean(youtubeLink)}
                                        onClick={startYoutubeStream}
                                        className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-xl shadow"
                                    >
                                        {loading ? "Starting..." : "Start Youtube Livestream"}
                                    </button>
                                </>
                            )}

                            {joined && youtubeLink && (
                                <>
                                    <button
                                        disabled={!youtubeLink || loading}
                                        onClick={() => stopRtmpPush(converterId)}
                                        className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-xl shadow"
                                    >
                                        {loading ? "Stopping..." : "Stop Youtube Livestream"}
                                    </button>
                                </>
                            )}
                        </div>
                        {/* Show YouTube link below the button */}
                        <div className="flex flex-col items-center">
                            {youtubeLink && (
                                <div className="mt-0">
                                    <a
                                        href={youtubeLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="break-all text-sm text-blue-600 underline hover:text-blue-800"
                                    >
                                        Open YouTube Stream
                                    </a>
                                </div>
                            )}

                        </div>

                    </div>
                </div>

                {/* Chat Panel */}
                {/* ChatPanel shown only when video is live */}

                {videoStarted && (
                    <div className="ml-2 h-[535px]">
                        <ChatPanel streamId={streamId} username={username} isHost={isHost} />
                    </div>
                )}
            </div>

        </div>
    );
};

export default AgoraClient;
