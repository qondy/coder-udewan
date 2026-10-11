import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyDdJVQR7wG9RVi0PN_BhWgwzjzp8IKPxhE',
  authDomain: 'coder-udewan.firebaseapp.com',
  projectId: 'coder-udewan',
  storageBucket: 'coder-udewan.firebasestorage.app',
  messagingSenderId: '915768719106',
  appId: '1:915768719106:web:9be24f91069da94d9bf41b',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
