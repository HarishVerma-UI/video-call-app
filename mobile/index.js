// Install WebRTC globals (RTCPeerConnection, MediaStream, navigator.mediaDevices…)
// before anything else, so the shared CallClient works unchanged on mobile.
import { registerGlobals } from 'react-native-webrtc';
import { registerRootComponent } from 'expo';
import App from './App';

registerGlobals();
registerRootComponent(App);
