import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Play, History, BarChart2, Trash2, X, Copy, Check, Settings, TrendingUp, Bluetooth, Palette, Timer, ChevronDown, LogIn, LogOut, User } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { connectGanTimer, GanTimerState } from 'gan-web-bluetooth';
import { Stackmat, Packet } from 'stackmat';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, query, where, deleteDoc, updateDoc } from 'firebase/firestore';

// --- Utils ---

const playBooSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(80, audioCtx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 1);

    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 1);
  } catch (e) {
    console.error('Failed to play sound:', e);
  }
};

const MOVES = ['U', 'D', 'L', 'R', 'F', 'B'];
const MODIFIERS = ['', "'", '2'];

function rotateFace(face: string[], times: number) {
  let res = [...face];
  for (let i = 0; i < times; i++) {
    res = [
      res[6], res[3], res[0],
      res[7], res[4], res[1],
      res[8], res[5], res[2]
    ];
  }
  return res;
}

function applyMove(cube: Record<string, string[]>, move: string) {
  const face = move[0];
  const modifier = move[1] || '';
  const times = modifier === "'" ? 3 : modifier === '2' ? 2 : 1;

  for (let i = 0; i < times; i++) {
    cube[face] = rotateFace(cube[face], 1);
    const { U, D, F, B, L, R } = cube;
    if (face === 'U') {
      const temp = [F[0], F[1], F[2]];
      F[0] = R[0]; F[1] = R[1]; F[2] = R[2];
      R[0] = B[0]; R[1] = B[1]; R[2] = B[2];
      B[0] = L[0]; B[1] = L[1]; B[2] = L[2];
      L[0] = temp[0]; L[1] = temp[1]; L[2] = temp[2];
    } else if (face === 'D') {
      const temp = [R[6], R[7], R[8]];
      R[6] = F[6]; R[7] = F[7]; R[8] = F[8];
      F[6] = L[6]; F[7] = L[7]; F[8] = L[8];
      L[6] = B[6]; L[7] = B[7]; L[8] = B[8];
      B[6] = temp[0]; B[7] = temp[1]; B[8] = temp[2];
    } else if (face === 'F') {
      const temp = [R[0], R[3], R[6]];
      R[0] = U[6]; R[3] = U[7]; R[6] = U[8];
      U[6] = L[8]; U[7] = L[5]; U[8] = L[2];
      L[8] = D[2]; L[5] = D[1]; L[2] = D[0];
      D[2] = temp[0]; D[1] = temp[1]; D[0] = temp[2];
    } else if (face === 'B') {
      const temp = [L[0], L[3], L[6]];
      L[0] = U[2]; L[3] = U[1]; L[6] = U[0];
      U[2] = R[8]; U[1] = R[5]; U[0] = R[2];
      R[8] = D[6]; R[5] = D[7]; R[2] = D[8];
      D[6] = temp[0]; D[7] = temp[1]; D[8] = temp[2];
    } else if (face === 'L') {
      const temp = [F[0], F[3], F[6]];
      F[0] = U[0]; F[3] = U[3]; F[6] = U[6];
      U[0] = B[8]; U[3] = B[5]; U[6] = B[2];
      B[8] = D[6]; B[5] = D[3]; B[2] = D[0];
      D[6] = temp[0]; D[3] = temp[1]; D[0] = temp[2];
    } else if (face === 'R') {
      const temp = [B[0], B[3], B[6]];
      B[0] = U[8]; B[3] = U[5]; B[6] = U[2];
      U[8] = F[8]; U[5] = F[5]; U[2] = F[2];
      F[8] = D[8]; F[5] = D[5]; F[2] = D[2];
      D[8] = temp[0]; D[5] = temp[1]; D[2] = temp[2];
    }
  }
}

function getScrambleUFace(scramble: string) {
  const cube = {
    U: Array(9).fill('white'),
    D: Array(9).fill('yellow'),
    F: Array(9).fill('green'),
    B: Array(9).fill('blue'),
    L: Array(9).fill('orange'),
    R: Array(9).fill('red'),
  };
  const moves = scramble.split(' ');
  for (const move of moves) {
    if (move) applyMove(cube, move);
  }
  return cube.U;
}

function generateScramble(event: string = '3x3') {
  const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  
  if (event === '2x2') {
    const moves = ['U', 'R', 'F'];
    const modifiers = ['', "'", '2'];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 11; i++) {
      let move;
      do { move = getRandom(moves); } while (move === lastMove);
      lastMove = move;
      scramble.push(move + getRandom(modifiers));
    }
    return scramble.join(' ');
  }
  
  if (event === '3x3') {
    const scramble = [];
    let lastMove = -1;
    let secondLastMove = -1;

    for (let i = 0; i < 20; i++) {
      let move;
      do {
        move = Math.floor(Math.random() * MOVES.length);
      } while (
        move === lastMove ||
        (Math.floor(move / 2) === Math.floor(lastMove / 2) && move === secondLastMove)
      );

      secondLastMove = lastMove;
      lastMove = move;

      const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
      scramble.push(MOVES[move] + modifier);
    }

    return scramble.join(' ');
  }

  if (event === '4x4' || event === '5x5' || event === '6x6' || event === '7x7') {
    const wideMoves = event === '4x4' || event === '5x5' ? ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'] : ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw', '3Uw', '3Dw', '3Lw', '3Rw', '3Fw', '3Bw'];
    const allMoves = [...MOVES, ...wideMoves];
    const length = event === '4x4' ? 40 : event === '5x5' ? 60 : event === '6x6' ? 80 : 100;
    
    const scramble = [];
    let lastMove = -1;
    let secondLastMove = -1;
    for (let i = 0; i < length; i++) {
      let move;
      do {
        move = Math.floor(Math.random() * allMoves.length);
      } while (
        move === lastMove ||
        (Math.floor(move / 2) === Math.floor(lastMove / 2) && move === secondLastMove)
      );
      secondLastMove = lastMove;
      lastMove = move;
      scramble.push(allMoves[move] + getRandom(MODIFIERS));
    }
    return scramble.join(' ');
  }

  if (event === 'Pyraminx') {
    const moves = ['U', 'L', 'R', 'B'];
    const modifiers = ['', "'"];
    const tips = ['u', 'l', 'r', 'b'];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 11; i++) {
      let move;
      do { move = getRandom(moves); } while (move === lastMove);
      lastMove = move;
      scramble.push(move + getRandom(modifiers));
    }
    for (const tip of tips) {
      if (Math.random() > 0.5) {
        scramble.push(tip + getRandom(modifiers));
      }
    }
    return scramble.join(' ');
  }

  if (event === 'Megaminx') {
    const scramble = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 10; j++) {
        const move = j % 2 === 0 ? 'R' : 'D';
        const modifier = Math.random() > 0.5 ? '++' : '--';
        scramble.push(move + modifier);
      }
      scramble.push(Math.random() > 0.5 ? 'U' : "U'");
    }
    return scramble.join(' ');
  }

  if (event === 'Skewb') {
    const moves = ['R', 'L', 'U', 'B'];
    const modifiers = ['', "'"];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 11; i++) {
      let move;
      do { move = getRandom(moves); } while (move === lastMove);
      lastMove = move;
      scramble.push(move + getRandom(modifiers));
    }
    return scramble.join(' ');
  }

  if (event === 'Square-1') {
    const scramble = [];
    for (let i = 0; i < 15; i++) {
      const top = Math.floor(Math.random() * 12) - 5;
      const bottom = Math.floor(Math.random() * 12) - 5;
      if (top === 0 && bottom === 0) continue;
      scramble.push(`(${top},${bottom})`);
    }
    scramble.push('/');
    return scramble.join(' / ');
  }

  if (event === 'Clock') {
    const pins = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'];
    const scramble = [];
    for (const pin of pins) {
      const turns = Math.floor(Math.random() * 12) - 5;
      scramble.push(`${pin}${turns >= 0 ? '+' : ''}${turns}`);
    }
    scramble.push('y2');
    for (const pin of ['U', 'R', 'D', 'L', 'ALL']) {
      const turns = Math.floor(Math.random() * 12) - 5;
      scramble.push(`${pin}${turns >= 0 ? '+' : ''}${turns}`);
    }
    for (const pin of ['UR', 'DR', 'DL', 'UL']) {
      if (Math.random() > 0.5) scramble.push(pin);
    }
    return scramble.join(' ');
  }

  return '';
}

function formatTime(timeMs: number | null, forceThreeDecimals?: boolean) {
  if (timeMs === null || timeMs === undefined) return '--';
  if (timeMs === Infinity) return 'DNF';
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  // Get settings from global if not provided (this is a bit hacky but works in this single-file app)
  // Actually, better to pass it or just use a default.
  const milliseconds = Math.floor(timeMs % 1000);
  const msFormatted = forceThreeDecimals 
    ? milliseconds.toString().padStart(3, '0') 
    : Math.floor(milliseconds / 10).toString().padStart(2, '0');

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${msFormatted}`;
  }
  return `${seconds}.${msFormatted}`;
}

function formatDuration(timeMs: number) {
  const totalSeconds = Math.floor(timeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

function calculateAverage(solves: Solve[], count: number) {
  if (solves.length < count) return null;
  const recent = solves.slice(0, count).map(s => {
    if (s.penalty === 'DNF') return Infinity;
    if (s.penalty === '+2') return s.time + 2000;
    return s.time;
  });
  recent.sort((a, b) => a - b);
  const trimmed = recent.slice(1, -1);
  if (trimmed.includes(Infinity)) return Infinity;
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return sum / trimmed.length;
}

function formatSolveTime(solve: Solve, forceThreeDecimals?: boolean) {
  if (solve.penalty === 'DNF') return 'DNF';
  let t = solve.time;
  if (solve.penalty === '+2') t += 2000;
  return formatTime(t, forceThreeDecimals) + (solve.penalty === '+2' ? '+' : '');
}

// --- Types ---

type Penalty = '+2' | 'DNF' | null;

type Solve = {
  id: string;
  time: number;
  scramble: string;
  date: number;
  penalty?: Penalty;
  sessionId: string;
  userId?: string;
  timestamp?: number;
  cubeId?: string;
};

type Session = {
  id: string;
  name: string;
  userId?: string;
};

type Cube = {
  id: string;
  name: string;
  userId?: string;
};

type TimerState = 'IDLE' | 'PRESSING' | 'READY' | 'RUNNING' | 'INSPECTION';

type AppSettings = {
  event: '2x2' | '3x3' | '4x4' | '5x5' | '6x6' | '7x7' | 'Pyraminx' | 'Megaminx' | 'Skewb' | 'Square-1' | 'Clock';
  theme: 'dark' | 'light' | 'ocean' | 'forest' | 'rose' | 'ultraviolet';
  fontFamily: 'sans' | 'mono' | 'serif';
  timerSize: number;
  scrambleSize: number;
  inputType: 'keyboard' | 'manual' | 'bluetooth' | 'stackmat';
  showScrambleVisualization: boolean;
  scrambleVisualizationSize: number;
  useInspection: boolean;
  hideTimerWhileRunning: boolean;
  holdToStartTime: number;
  showThreeDecimalPlaces: boolean;
  autoDivideManualInput: boolean;
  showConfettiOnPB: boolean;
  showBooOnWorstTime: boolean;
  autoScaleScramble: boolean;
  accentColor: string;
  timerColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundImage: string | null;
  backgroundImageDarkness: number;
};

const DEFAULT_SETTINGS: AppSettings = {
  event: '3x3',
  theme: 'dark',
  fontFamily: 'sans',
  timerSize: 7,
  scrambleSize: 2,
  inputType: 'keyboard',
  showScrambleVisualization: false,
  scrambleVisualizationSize: typeof window !== 'undefined' && window.innerWidth < 768 ? 1.25 : 2,
  useInspection: false,
  hideTimerWhileRunning: false,
  holdToStartTime: 300,
  showThreeDecimalPlaces: false,
  autoDivideManualInput: false,
  showConfettiOnPB: true,
  showBooOnWorstTime: true,
  autoScaleScramble: true,
  accentColor: '#10b981', // emerald-500
  timerColor: '#10b981', // emerald-500
  backgroundColor: '#09090b', // zinc-950
  textColor: '#f4f4f5', // zinc-100
  backgroundImage: null,
  backgroundImageDarkness: 0.5,
};

const fontClasses = {
  sans: 'font-sans',
  mono: 'font-mono',
  serif: 'font-serif',
};

// --- Components ---

export default function App() {
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem('cube_sessions');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [{ id: 'default', name: 'Session 1' }];
  });
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    return localStorage.getItem('cube_current_session_id') || 'default';
  });
  const [cubes, setCubes] = useState<Cube[]>(() => {
    try {
      const saved = localStorage.getItem('cube_cubes');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [{ id: 'default-cube', name: 'Default Cube' }];
  });
  const [currentCubeId, setCurrentCubeId] = useState(() => {
    return localStorage.getItem('cube_current_cube_id') || 'default-cube';
  });
  const [solves, setSolves] = useState<Solve[]>(() => {
    try {
      const saved = localStorage.getItem('cube_solves');
      return saved ? JSON.parse(saved) : [];
    } catch {
      // ignore
    }
    return [];
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('cube_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme === 'zinc' || parsed.theme === 'black' || parsed.theme === 'slate') {
          parsed.theme = 'dark';
        }
        if (!parsed.event) {
          parsed.event = '3x3';
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem('cube_cubes', JSON.stringify(cubes));
  }, [cubes]);

  useEffect(() => {
    localStorage.setItem('cube_current_cube_id', currentCubeId);
  }, [currentCubeId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    };
  }, []);
  const [currentScramble, setCurrentScramble] = useState(() => {
    try {
      const saved = localStorage.getItem('cube_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return generateScramble(parsed.event || '3x3');
      }
    } catch {
      // ignore
    }
    return generateScramble('3x3');
  });
  const [timerState, setTimerState] = useState<TimerState>('IDLE');
  const [time, setTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'timer' | 'history' | 'stats'>('timer');
  const [currentSolveId, setCurrentSolveId] = useState<string | null>(null);
  const [selectedSolveId, setSelectedSolveId] = useState<string | null>(null);
  const [copiedScramble, setCopiedScramble] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEventDropdownOpen, setIsEventDropdownOpen] = useState(false);
  const [showBooOverlay, setShowBooOverlay] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'appearance' | 'timer' | 'cubes'>('general');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState<{solves: Solve[], title: string} | null>(null);
  const [historySort, setHistorySort] = useState<'newest' | 'fastest' | 'slowest'>('newest');
  const [newSessionName, setNewSessionName] = useState('');
  const [newCubeName, setNewCubeName] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [manualTimeInput, setManualTimeInput] = useState('');
  const [inspectionStartTime, setInspectionStartTime] = useState<number | null>(null);
  const [inspectionPenalty, setInspectionPenalty] = useState<Penalty>(null);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const bluetoothConnRef = useRef<unknown>(null);
  const [isStackmatConnected, setIsStackmatConnected] = useState(false);
  const stackmatRef = useRef<Stackmat | null>(null);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoadingAuth(false);
      if (currentUser) {
        // Fetch solves and sessions from Firestore
        try {
          const solvesQuery = query(collection(db, 'solves'), where('userId', '==', currentUser.uid));
          const solvesSnapshot = await getDocs(solvesQuery);
          const fetchedSolves: Solve[] = [];
          solvesSnapshot.forEach((doc) => {
            fetchedSolves.push(doc.data() as Solve);
          });
          if (fetchedSolves.length > 0) {
            setSolves(fetchedSolves.sort((a, b) => (b.timestamp || b.date) - (a.timestamp || a.date)));
          }

          const sessionsQuery = query(collection(db, 'sessions'), where('userId', '==', currentUser.uid));
          const sessionsSnapshot = await getDocs(sessionsQuery);
          const fetchedSessions: Session[] = [];
          sessionsSnapshot.forEach((doc) => {
            fetchedSessions.push(doc.data() as Session);
          });
          if (fetchedSessions.length > 0) {
            setSessions(fetchedSessions);
            if (!fetchedSessions.find(s => s.id === currentSessionId)) {
              setCurrentSessionId(fetchedSessions[0].id);
            }
          }

          const cubesQuery = query(collection(db, 'cubes'), where('userId', '==', currentUser.uid));
          const cubesSnapshot = await getDocs(cubesQuery);
          const fetchedCubes: Cube[] = [];
          cubesSnapshot.forEach((doc) => {
            fetchedCubes.push(doc.data() as Cube);
          });
          if (fetchedCubes.length > 0) {
            setCubes(fetchedCubes);
            if (!fetchedCubes.find(c => c.id === currentCubeId)) {
              setCurrentCubeId(fetchedCubes[0].id);
            }
          }
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      } else {
        // Revert to local storage
        try {
          const savedSolves = localStorage.getItem('cube_solves');
          if (savedSolves) setSolves(JSON.parse(savedSolves));
          const savedSessions = localStorage.getItem('cube_sessions');
          if (savedSessions) setSessions(JSON.parse(savedSessions));
          const savedSessionId = localStorage.getItem('cube_current_session_id');
          if (savedSessionId) setCurrentSessionId(savedSessionId);
          const savedCubes = localStorage.getItem('cube_cubes');
          if (savedCubes) setCubes(JSON.parse(savedCubes));
          const savedCubeId = localStorage.getItem('cube_current_cube_id');
          if (savedCubeId) setCurrentCubeId(savedCubeId);
        } catch (e) {
          // ignore
        }
      }
    });
    return unsubscribe;
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScramble(text);
    setTimeout(() => setCopiedScramble(null), 2000);
  };

  // Migration: Ensure all existing solves have a sessionId
  useEffect(() => {
    setSolves(prev => {
      const needsMigration = prev.some(s => !s.sessionId);
      if (needsMigration) {
        return prev.map(s => ({ ...s, sessionId: s.sessionId || 'default' }));
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('cube_solves', JSON.stringify(solves));
  }, [solves]);

  useEffect(() => {
    localStorage.setItem('cube_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('cube_current_session_id', currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('cube_settings', JSON.stringify(settings));
  }, [settings]);

  const currentSessionSolves = useMemo(() => {
    return solves.filter(s => s.sessionId === currentSessionId);
  }, [solves, currentSessionId]);

  const updateTime = useCallback(() => {
    setTime(performance.now() - startTimeRef.current);
    timerRef.current = requestAnimationFrame(updateTime);
  }, []);

  const startTimer = useCallback(() => {
    setTimerState('RUNNING');
    setCurrentSolveId(null);
    setInspectionStartTime(null);
    startTimeRef.current = performance.now();
    timerRef.current = requestAnimationFrame(updateTime);
  }, [updateTime]);

  const addSolve = useCallback((finalTime: number, penaltyOverride?: Penalty) => {
    const penalty = penaltyOverride !== undefined ? penaltyOverride : inspectionPenalty;
    const newId = Math.random().toString(36).substring(2, 9);
    const newSolve: Solve = {
      id: newId,
      time: finalTime,
      scramble: currentScramble,
      date: Date.now(),
      sessionId: currentSessionId,
      cubeId: currentCubeId,
      penalty: penalty,
    };
    
    setSolves(prev => {
      const currentSessionSolves = prev.filter(s => s.sessionId === currentSessionId);
      const validSolves = currentSessionSolves.filter(s => s.penalty !== 'DNF');
      
      const sessionTimes = validSolves.map(s => s.time + (s.penalty === '+2' ? 2000 : 0));
      const currentBest = sessionTimes.length > 0 ? Math.min(...sessionTimes) : Infinity;
      const currentWorst = sessionTimes.length > 0 ? Math.max(...sessionTimes) : -Infinity;
      
      const finalTimeWithPenalty = finalTime + (penalty === '+2' ? 2000 : 0);

      if (settings.showConfettiOnPB && finalTimeWithPenalty < currentBest && validSolves.length > 0 && penalty !== 'DNF') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']
        });
      } else if (settings.showBooOnWorstTime && currentSessionSolves.length >= 50 && finalTimeWithPenalty > currentWorst && validSolves.length > 0 && penalty !== 'DNF') {
        playBooSound();
        setShowBooOverlay(true);
        setTimeout(() => setShowBooOverlay(false), 2000);
      }
      
      return [newSolve, ...prev];
    });
    
    if (user) {
      setDoc(doc(db, 'solves', newId), { ...newSolve, userId: user.uid, timestamp: Date.now() }).catch(console.error);
    }
    
    setCurrentSolveId(newId);
    setCurrentScramble(generateScramble(settings.event));
  }, [currentScramble, currentSessionId, settings.event, inspectionPenalty, settings.showBooOnWorstTime, settings.showConfettiOnPB, user]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    const finalTime = performance.now() - startTimeRef.current;
    setTime(finalTime);
    setTimerState('IDLE');
    addSolve(finalTime);
  }, [addSolve]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTimeInput.trim()) return;
    
    let finalTime = 0;
    
    // Auto-divide logic: if enabled and input is just digits
    if (settings.autoDivideManualInput && /^\d+$/.test(manualTimeInput.trim())) {
      const digits = parseInt(manualTimeInput.trim());
      if (!isNaN(digits)) finalTime = (digits / 100) * 1000;
    } else {
      const parts = manualTimeInput.split(':');
      if (parts.length === 1) {
        const seconds = parseFloat(parts[0]);
        if (!isNaN(seconds)) finalTime = seconds * 1000;
      } else if (parts.length === 2) {
        const minutes = parseInt(parts[0]);
        const seconds = parseFloat(parts[1]);
        if (!isNaN(minutes) && !isNaN(seconds)) finalTime = (minutes * 60 + seconds) * 1000;
      }
    }
    
    if (finalTime > 0) {
      setTime(finalTime);
      addSolve(finalTime);
      setManualTimeInput('');
    }
  };

  const connectToBluetoothTimer = async () => {
    try {
      const conn = await connectGanTimer();
      bluetoothConnRef.current = conn;
      setIsBluetoothConnected(true);
      
      conn.events$.subscribe((timerEvent: { state: number, recordedTime?: { asTimestamp: number } }) => {
        switch (timerEvent.state) {
          case GanTimerState.IDLE:
          case GanTimerState.HANDS_OFF:
            setTimerState('IDLE');
            break;
          case GanTimerState.HANDS_ON:
            setTimerState('PRESSING');
            break;
          case GanTimerState.GET_SET:
            setTimerState('READY');
            break;
          case GanTimerState.RUNNING:
            setTimerState('RUNNING');
            setCurrentSolveId(null);
            startTimeRef.current = performance.now();
            timerRef.current = requestAnimationFrame(updateTime);
            break;
          case GanTimerState.STOPPED:
            if (timerRef.current) {
              cancelAnimationFrame(timerRef.current);
              timerRef.current = null;
            }
            setTimerState('IDLE');
            if (timerEvent.recordedTime) {
              setTime(timerEvent.recordedTime.asTimestamp);
              addSolve(timerEvent.recordedTime.asTimestamp);
            }
            break;
          case GanTimerState.DISCONNECT:
            setIsBluetoothConnected(false);
            bluetoothConnRef.current = null;
            break;
        }
      });
    } catch (e) {
      console.error('Failed to connect GAN timer:', e);
    }
  };

  const connectToStackmat = () => {
    try {
      if (stackmatRef.current) {
        stackmatRef.current.stop();
        stackmatRef.current.off();
      }
      
      const stackmat = new Stackmat();
      stackmatRef.current = stackmat;
      
      stackmat.on('timerConnected', () => {
        setIsStackmatConnected(true);
      });
      
      stackmat.on('timerDisconnected', () => {
        setIsStackmatConnected(false);
        setTimerState('IDLE');
      });
      
      stackmat.on('started', () => {
        setTimerState('RUNNING');
        setCurrentSolveId(null);
        startTimeRef.current = performance.now();
        timerRef.current = requestAnimationFrame(updateTime);
      });
      
      stackmat.on('stopped', (packet: Packet) => {
        if (timerRef.current) {
          cancelAnimationFrame(timerRef.current);
          timerRef.current = null;
        }
        setTimerState('IDLE');
        setTime(packet.timeInMilliseconds);
        addSolve(packet.timeInMilliseconds);
      });
      
      stackmat.on('reset', () => {
        setTimerState('IDLE');
        setTime(0);
      });
      
      stackmat.on('ready', () => {
        setTimerState('READY');
      });
      
      stackmat.on('unready', () => {
        setTimerState('IDLE');
      });
      
      stackmat.on('starting', () => {
        setTimerState('READY');
      });
      
      stackmat.on('leftHandDown', () => {
        if (timerState === 'IDLE') setTimerState('PRESSING');
      });
      
      stackmat.on('rightHandDown', () => {
        if (timerState === 'IDLE') setTimerState('PRESSING');
      });
      
      stackmat.start();
    } catch (e) {
      console.error('Failed to connect Stackmat timer:', e);
    }
  };

  const togglePenalty = (id: string, penalty: Penalty) => {
    setSolves(prev => {
      const newSolves = prev.map(s => {
        if (s.id !== id) return s;
        const newPenalty = s.penalty === penalty ? null : penalty;
        if (user) {
          updateDoc(doc(db, 'solves', id), { penalty: newPenalty }).catch(console.error);
        }
        return { ...s, penalty: newPenalty };
      });
      return newSolves;
    });
  };

  const addSession = (name: string) => {
    if (name.trim()) {
      const newSession = { id: Math.random().toString(36).substring(2, 9), name: name.trim() };
      setSessions(prev => [...prev, newSession]);
      setCurrentSessionId(newSession.id);
      setNewSessionName('');
      if (user) {
        setDoc(doc(db, 'sessions', newSession.id), { ...newSession, userId: user.uid }).catch(console.error);
      }
    }
  };

  const deleteSession = async (id: string) => {
    if (sessions.length <= 1) {
      const newId = Math.random().toString(36).substring(2, 9);
      const newSession = { id: newId, name: 'Default Session' };
      setSessions([newSession]);
      setCurrentSessionId(newId);
      setSolves([]);
      if (user) {
        setDoc(doc(db, 'sessions', newId), { ...newSession, userId: user.uid }).catch(console.error);
        deleteDoc(doc(db, 'sessions', id)).catch(console.error);
        // Delete solves for this session
        const solvesQuery = query(collection(db, 'solves'), where('sessionId', '==', id));
        const solvesSnapshot = await getDocs(solvesQuery);
        solvesSnapshot.forEach((d) => deleteDoc(doc(db, 'solves', d.id)));
      }
    } else {
      const remaining = sessions.filter(s => s.id !== id);
      setSessions(remaining);
      if (currentSessionId === id) {
        setCurrentSessionId(remaining[0].id);
      }
      setSolves(prevSolves => prevSolves.filter(s => s.sessionId !== id));
      if (user) {
        deleteDoc(doc(db, 'sessions', id)).catch(console.error);
        // Delete solves for this session
        const solvesQuery = query(collection(db, 'solves'), where('sessionId', '==', id));
        const solvesSnapshot = await getDocs(solvesQuery);
        solvesSnapshot.forEach((d) => deleteDoc(doc(db, 'solves', d.id)));
      }
    }
    setDeletingSessionId(null);
  };

  const renameSession = (id: string, newName: string) => {
    if (newName.trim()) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName.trim() } : s));
      setEditingSessionId(null);
      if (user) {
        updateDoc(doc(db, 'sessions', id), { name: newName.trim() }).catch(console.error);
      }
    }
  };

  const addCube = (name: string) => {
    if (name.trim()) {
      const newCube = { id: Math.random().toString(36).substring(2, 9), name: name.trim() };
      setCubes(prev => [...prev, newCube]);
      setCurrentCubeId(newCube.id);
      setNewCubeName('');
      if (user) {
        setDoc(doc(db, 'cubes', newCube.id), { ...newCube, userId: user.uid }).catch(console.error);
      }
    }
  };

  const deleteCube = (id: string) => {
    if (cubes.length <= 1) return;
    const remaining = cubes.filter(c => c.id !== id);
    setCubes(remaining);
    if (currentCubeId === id) {
      setCurrentCubeId(remaining[0].id);
    }
    if (user) {
      deleteDoc(doc(db, 'cubes', id)).catch(console.error);
    }
  };

  const handleDown = useCallback((e?: React.SyntheticEvent | KeyboardEvent) => {
    if (settings.inputType !== 'keyboard') return;
    if (activeTab !== 'timer' || isSettingsOpen || isSessionModalOpen || selectedSolveId) return;

    if (e && e.type === 'keydown') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      
      // If timer is running, any key stops it. Otherwise, only Space starts it.
      if (timerState !== 'RUNNING' && (e as KeyboardEvent).code !== 'Space') return;
      
      if ((e as KeyboardEvent).repeat) return;
      e.preventDefault();
    }

    if (timerState === 'IDLE') {
      setTimerState('PRESSING');
      setTime(0);
      setInspectionPenalty(null);
      setInspectionStartTime(null);
      if (!settings.useInspection) {
        pressTimeoutRef.current = setTimeout(() => {
          setTimerState('READY');
        }, settings.holdToStartTime);
      }
    } else if (timerState === 'INSPECTION') {
      setTimerState('PRESSING');
      setTime(0);
      pressTimeoutRef.current = setTimeout(() => {
        setTimerState('READY');
      }, settings.holdToStartTime);
    } else if (timerState === 'RUNNING') {
      stopTimer();
    }
  }, [timerState, stopTimer, activeTab, isSettingsOpen, isSessionModalOpen, selectedSolveId, settings.useInspection, settings.holdToStartTime, settings.inputType]);

  const handleUp = useCallback((e?: React.SyntheticEvent | KeyboardEvent) => {
    if (settings.inputType !== 'keyboard') return;
    if (activeTab !== 'timer' || isSettingsOpen || isSessionModalOpen || selectedSolveId) return;

    if (e && e.type === 'keyup') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      
      // If timer is running, any key stops it. Otherwise, only Space starts it.
      if (timerState !== 'RUNNING' && (e as KeyboardEvent).code !== 'Space') return;
    }

    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }

    if (timerState === 'READY') {
      startTimer();
    } else if (timerState === 'PRESSING') {
      if (settings.useInspection && !inspectionStartTime) {
        setTimerState('INSPECTION');
        setInspectionStartTime(performance.now());
      } else {
        setTimerState('IDLE');
      }
    }
  }, [timerState, startTimer, activeTab, isSettingsOpen, isSessionModalOpen, selectedSolveId, settings.inputType, settings.useInspection, inspectionStartTime]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleDown(e);
    const onKeyUp = (e: KeyboardEvent) => handleUp(e);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleDown, handleUp]);

  useEffect(() => {
    return () => {
      if (stackmatRef.current) {
        stackmatRef.current.stop();
        stackmatRef.current.off();
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerState === 'INSPECTION' && inspectionStartTime) {
      interval = setInterval(() => {
        const elapsed = (performance.now() - inspectionStartTime) / 1000;
        const remaining = 15 - elapsed;
        
        if (elapsed >= 17) {
          setInspectionPenalty('DNF');
        } else if (elapsed >= 15) {
          setInspectionPenalty('+2');
        }
        
        setTime(Math.max(0, Math.ceil(remaining)));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [timerState, inspectionStartTime]);

  const deleteSolve = (id: string) => {
    setSolves(prev => prev.filter(s => s.id !== id));
    if (user) {
      deleteDoc(doc(db, 'solves', id)).catch(console.error);
    }
  };

  const ao5 = calculateAverage(currentSessionSolves, 5);
  const ao12 = calculateAverage(currentSessionSolves, 12);
  
  const validSolves = currentSessionSolves.filter(s => s.penalty !== 'DNF');
  const best = validSolves.length > 0 ? Math.min(...validSolves.map(s => s.time + (s.penalty === '+2' ? 2000 : 0))) : null;
  const meanOfAll = validSolves.length > 0 ? validSolves.reduce((a, b) => a + b.time + (b.penalty === '+2' ? 2000 : 0), 0) / validSolves.length : null;
  const totalTimeSession = currentSessionSolves.reduce((acc, s) => acc + s.time + (s.penalty === '+2' ? 2000 : 0), 0);
  const totalTimeGlobal = solves.reduce((acc, s) => acc + s.time + (s.penalty === '+2' ? 2000 : 0), 0);

  const currentSolve = currentSessionSolves.find(s => s.id === currentSolveId);
  const displayTime = timerState === 'IDLE' && currentSolve 
    ? formatSolveTime(currentSolve, settings.showThreeDecimalPlaces) 
    : timerState === 'INSPECTION'
      ? (inspectionPenalty === 'DNF' ? 'DNF' : (inspectionPenalty === '+2' ? '+2' : formatTime(time * 1000, settings.showThreeDecimalPlaces).split('.')[0]))
      : (timerState === 'RUNNING' && settings.hideTimerWhileRunning)
        ? 'Running'
        : formatTime(time, settings.showThreeDecimalPlaces);

  const chartData = useMemo(() => {
    return [...currentSessionSolves]
      .reverse()
      .filter(s => s.penalty !== 'DNF')
      .map((s, i) => ({
        index: i + 1,
        time: (s.time + (s.penalty === '+2' ? 2000 : 0)) / 1000,
        formattedTime: formatTime(s.time + (s.penalty === '+2' ? 2000 : 0), settings.showThreeDecimalPlaces)
      }));
  }, [currentSessionSolves, settings.showThreeDecimalPlaces]);

  const distributionData = useMemo(() => {
    const times = currentSessionSolves
      .filter(s => s.penalty !== 'DNF')
      .map(s => (s.time + (s.penalty === '+2' ? 2000 : 0)) / 1000);
    
    if (times.length === 0) return [];

    const min = Math.floor(Math.min(...times));
    const max = Math.ceil(Math.max(...times));
    
    // Create bins of 1 second
    const bins: Record<string, number> = {};
    for (let i = min; i <= max; i++) {
      bins[`${i}-${i+1}s`] = 0;
    }

    times.forEach(t => {
      const bin = Math.floor(t);
      bins[`${bin}-${bin+1}s`] = (bins[`${bin}-${bin+1}s`] || 0) + 1;
    });

    return Object.entries(bins).map(([range, count]) => ({
      range,
      count
    })).filter(bin => bin.count > 0 || (parseInt(bin.range) >= min && parseInt(bin.range) <= max)); // keep empty bins between min and max
  }, [currentSessionSolves]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0] || { id: 'default', name: 'Session 1' };

  const dynamicScrambleSize = useMemo(() => {
    const len = currentScramble.length;
    let scale = 1;
    if (settings.autoScaleScramble) {
      if (len > 250) scale = 0.5;
      else if (len > 180) scale = 0.6;
      else if (len > 120) scale = 0.75;
      else if (len > 80) scale = 0.85;
    }
    
    return {
      rem: settings.scrambleSize * scale,
      vw: 6 * scale,
      vh: 4 * scale
    };
  }, [currentScramble, settings.scrambleSize, settings.autoScaleScramble]);

  return (
    <div 
      className={`min-h-screen flex flex-col select-none ${fontClasses[settings.fontFamily] || fontClasses.sans} transition-colors duration-300`}
      style={{ 
        backgroundColor: settings.backgroundColor, 
        color: settings.textColor,
        ['--bg-color' as unknown as keyof React.CSSProperties]: settings.backgroundColor,
        ['--text-color' as unknown as keyof React.CSSProperties]: settings.textColor,
        ['--color-zinc-950' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 100%, var(--text-color))',
        ['--color-zinc-900' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 95%, var(--text-color))',
        ['--color-zinc-800' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 90%, var(--text-color))',
        ['--color-zinc-700' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 80%, var(--text-color))',
        ['--color-zinc-600' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 70%, var(--text-color))',
        ['--color-zinc-500' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 50%, var(--text-color))',
        ['--color-zinc-400' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 30%, var(--text-color))',
        ['--color-zinc-300' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 20%, var(--text-color))',
        ['--color-zinc-200' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 10%, var(--text-color))',
        ['--color-zinc-100' as unknown as keyof React.CSSProperties]: 'color-mix(in srgb, var(--bg-color) 5%, var(--text-color))',
        ['--color-zinc-50' as unknown as keyof React.CSSProperties]: 'var(--text-color)',
        ['--accent-color' as unknown as keyof React.CSSProperties]: settings.accentColor,
        ['--accent-color-alpha' as unknown as keyof React.CSSProperties]: `${settings.accentColor}40`,
        ['--timer-color' as unknown as keyof React.CSSProperties]: settings.timerColor,
        backgroundImage: settings.backgroundImage ? `linear-gradient(rgba(0,0,0,${settings.backgroundImageDarkness}), rgba(0,0,0,${settings.backgroundImageDarkness})), url(${settings.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {settings.backgroundImage && <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{ opacity: settings.backgroundImageDarkness }} />}
      {/* Header / Tabs */}
      <div className="flex flex-col border-b border-zinc-800 bg-zinc-900/50 z-10">
        <div className="flex justify-between items-center px-4 py-2 border-b border-zinc-800/50">
          <button 
            onClick={() => setIsSessionModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50 transition-colors text-sm font-medium"
          >
            <span className="truncate max-w-[120px]">{currentSession.name}</span>
            <Settings size={14} className="opacity-50" />
          </button>
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            {currentSessionSolves.length} Solves
          </div>
        </div>
        <div className="flex justify-around items-center p-2">
          <button 
            onClick={() => setActiveTab('timer')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeTab === 'timer' ? '' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={{ color: activeTab === 'timer' ? settings.accentColor : undefined }}
          >
            <Play size={24} />
            <span className="text-xs font-medium">Timer</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeTab === 'history' ? '' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={{ color: activeTab === 'history' ? settings.accentColor : undefined }}
          >
            <History size={24} />
            <span className="text-xs font-medium">History</span>
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeTab === 'stats' ? '' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={{ color: activeTab === 'stats' ? settings.accentColor : undefined }}
          >
            <BarChart2 size={24} />
            <span className="text-xs font-medium">Stats</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {activeTab === 'timer' && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center p-6 touch-none"
            onPointerDown={settings.inputType === 'keyboard' ? handleDown : undefined}
            onPointerUp={settings.inputType === 'keyboard' ? handleUp : undefined}
            onPointerCancel={settings.inputType === 'keyboard' ? handleUp : undefined}
          >
            {/* Scramble */}
            <div className={`absolute top-8 left-6 right-6 flex flex-col items-center transition-opacity duration-200 ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'}`}>
              <p 
                className="font-mono text-zinc-300 tracking-wide leading-relaxed text-center mb-4"
                style={{ fontSize: `min(${dynamicScrambleSize.rem}rem, ${dynamicScrambleSize.vw}vw, ${dynamicScrambleSize.vh}vh)` }}
              >
                {currentScramble}
              </p>
              {settings.showScrambleVisualization && settings.event === '3x3' && (
                <div 
                  className="grid grid-cols-3 bg-zinc-800 rounded-lg shadow-inner"
                  style={{ gap: `min(${settings.scrambleVisualizationSize * 0.1}rem, 1.5vw, 1vh)`, padding: `min(${settings.scrambleVisualizationSize * 0.1}rem, 1.5vw, 1vh)` }}
                >
                  {getScrambleUFace(currentScramble).map((color, i) => (
                    <div 
                      key={i} 
                      className="rounded-sm shadow-sm"
                      style={{ 
                        width: `min(${settings.scrambleVisualizationSize}rem, 12vw, 6vh)`, 
                        height: `min(${settings.scrambleVisualizationSize}rem, 12vw, 6vh)`,
                        backgroundColor: color === 'white' ? '#f4f4f5' : color === 'yellow' ? '#eab308' : color === 'green' ? '#22c55e' : color === 'blue' ? '#3b82f6' : color === 'orange' ? '#f97316' : '#ef4444' 
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Timer */}
            {settings.inputType === 'manual' ? (
              <form onSubmit={handleManualSubmit} className="flex flex-col items-center gap-4">
                <input
                  type="text"
                  value={manualTimeInput}
                  onChange={(e) => setManualTimeInput(e.target.value)}
                  placeholder=""
                  className="bg-transparent border-b-2 border-zinc-700 text-center focus:outline-none font-bold tracking-tighter tabular-nums text-zinc-100 placeholder:text-zinc-700"
                  style={{ 
                    fontSize: `min(${settings.timerSize * 0.5}rem, 11vw)`, 
                    lineHeight: 1, 
                    width: `min(${settings.timerSize * 2.5}rem, 80vw)`,
                    borderColor: manualTimeInput ? settings.accentColor : undefined
                  }}
                  autoFocus
                />
                <button 
                  type="submit"
                  className="px-8 py-3 rounded-xl font-bold transition-colors"
                  style={{ backgroundColor: `${settings.accentColor}33`, color: settings.accentColor }}
                >
                  Add Solve
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center">
                {timerState === 'INSPECTION' && (
                  <span className="text-zinc-500 text-sm uppercase tracking-widest mb-4 animate-pulse">Inspection</span>
                )}
                <div 
                  className={`font-bold tracking-tighter tabular-nums transition-colors duration-200 ${
                    timerState === 'PRESSING' ? 'text-red-400' :
                    timerState === 'READY' ? '' : 
                    timerState === 'INSPECTION' ? (inspectionPenalty ? 'text-red-400' : 'text-zinc-300') :
                    ''
                  }`}
                  style={{ 
                    fontSize: `min(${settings.timerSize}rem, 22vw)`, 
                    lineHeight: 1,
                    color: timerState === 'READY' ? settings.accentColor : ((timerState === 'IDLE' || timerState === 'RUNNING') ? settings.timerColor : undefined)
                  }}
                >
                  {displayTime}
                </div>
              </div>
            )}

            {/* Bluetooth Connect Button */}
            {settings.inputType === 'bluetooth' && !isBluetoothConnected && (
              <button
                onClick={connectToBluetoothTimer}
                className="mt-8 flex items-center gap-2 px-6 py-3 bg-blue-500/20 text-blue-400 rounded-xl font-bold hover:bg-blue-500/30 transition-colors"
              >
                <Bluetooth size={20} />
                Connect GAN Timer
              </button>
            )}
            {settings.inputType === 'bluetooth' && isBluetoothConnected && (
              <div className="mt-8 flex items-center gap-2 text-blue-400 font-medium">
                <Bluetooth size={20} />
                GAN Timer Connected
              </div>
            )}

            {/* Stackmat Connect Button */}
            {settings.inputType === 'stackmat' && !isStackmatConnected && (
              <button
                onClick={connectToStackmat}
                className="mt-8 flex items-center gap-2 px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-xl font-bold hover:bg-emerald-500/30 transition-colors"
              >
                <Timer size={20} />
                Connect Stackmat
              </button>
            )}
            {settings.inputType === 'stackmat' && isStackmatConnected && (
              <div className="mt-8 flex items-center gap-2 text-emerald-400 font-medium">
                <Timer size={20} />
                Stackmat Connected
              </div>
            )}

            {/* Penalty Buttons */}
            {timerState === 'IDLE' && currentSolveId && settings.inputType !== 'manual' && (
              <div className="flex gap-4 mt-8 z-20">
                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); togglePenalty(currentSolveId, '+2'); }}
                  className={`px-6 py-2 rounded-xl font-mono font-bold transition-colors ${currentSolve?.penalty === '+2' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                >
                  +2
                </button>
                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); deleteSolve(currentSolveId); setCurrentSolveId(null); setTime(0); }}
                  className="px-6 py-2 rounded-xl bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-colors"
                  title="Delete Solve"
                >
                  <Trash2 size={20} />
                </button>
                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); togglePenalty(currentSolveId, 'DNF'); }}
                  className={`px-6 py-2 rounded-xl font-mono font-bold transition-colors ${currentSolve?.penalty === 'DNF' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                >
                  DNF
                </button>
              </div>
            )}

            {/* Quick Stats */}
            <div className={`absolute bottom-12 flex gap-8 text-zinc-500 font-mono text-lg transition-opacity duration-200 ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'}`}>
              <button 
                className="flex flex-col items-center hover:text-zinc-300 transition-colors"
                onClick={() => {
                  if (ao5) {
                    setSelectedAverageSolves({
                      solves: currentSessionSolves.slice(0, 5),
                      title: 'Ao5'
                    });
                  }
                }}
              >
                <span className="text-xs uppercase tracking-widest mb-1">Ao5</span>
                <span className="text-zinc-300">{ao5 ? formatTime(ao5) : '--'}</span>
              </button>
              <button 
                className="flex flex-col items-center hover:text-zinc-300 transition-colors"
                onClick={() => {
                  if (ao12) {
                    setSelectedAverageSolves({
                      solves: currentSessionSolves.slice(0, 12),
                      title: 'Ao12'
                    });
                  }
                }}
              >
                <span className="text-xs uppercase tracking-widest mb-1">Ao12</span>
                <span className="text-zinc-300">{ao12 ? formatTime(ao12) : '--'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 pb-24 custom-scrollbar pr-2">
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Solves ({currentSessionSolves.length})</h2>
                <div className="flex gap-2">
                  {(['newest', 'fastest', 'slowest'] as const).map(sort => (
                    <button
                      key={sort}
                      onClick={() => setHistorySort(sort)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${historySort === sort ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                      style={{ backgroundColor: historySort === sort ? `${settings.accentColor}33` : undefined, color: historySort === sort ? settings.accentColor : undefined }}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              </div>
              
              {currentSessionSolves.length === 0 ? (
                <div className="text-center text-zinc-500 mt-20">
                  <History size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No solves in this session. Get cubing!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...currentSessionSolves].sort((a, b) => {
                    if (historySort === 'newest') return b.date - a.date;
                    if (historySort === 'fastest') return a.time - b.time;
                    if (historySort === 'slowest') return b.time - a.time;
                    return 0;
                  }).map((solve, index) => (
                    <div 
                      key={solve.id} 
                      onClick={() => setSelectedSolveId(solve.id)}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between group cursor-pointer hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-zinc-500 font-mono w-8 text-right">
                          {currentSessionSolves.length - index}.
                        </span>
                        <span className={`text-xl font-mono ${solve.penalty === 'DNF' ? 'text-red-400' : ''}`} style={{ color: solve.penalty !== 'DNF' ? settings.accentColor : undefined }}>
                          {formatSolveTime(solve, settings.showThreeDecimalPlaces)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-zinc-600 hidden md:block max-w-xs truncate">
                          {solve.scramble}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteSolve(solve.id); }}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-2"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 pb-24 custom-scrollbar pr-2">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                <BarChart2 style={{ color: settings.accentColor }} />
                Statistics
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <StatCard label="Best" value={best ? formatTime(best, settings.showThreeDecimalPlaces) : '--'} />
                <StatCard label="Current Ao5" value={ao5 ? formatTime(ao5, settings.showThreeDecimalPlaces) : '--'} />
                <StatCard label="Current Ao12" value={ao12 ? formatTime(ao12, settings.showThreeDecimalPlaces) : '--'} />
                <StatCard label="Total Solves" value={currentSessionSolves.length.toString()} />
                <StatCard label="Mean of All" value={meanOfAll ? formatTime(meanOfAll, settings.showThreeDecimalPlaces) : '--'} />
                <StatCard label="Session Time" value={formatDuration(totalTimeSession)} />
                <StatCard label="Total Time" value={formatDuration(totalTimeGlobal)} />
              </div>

              {/* Chart Section */}
              {chartData.length > 1 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <TrendingUp size={20} style={{ color: settings.accentColor }} />
                      Solve Time Trend
                    </h3>
                    <span className="text-xs text-zinc-500 uppercase tracking-widest">Seconds</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis 
                          dataKey="index" 
                          stroke="#71717a" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                          label={{ value: 'Solve #', position: 'insideBottom', offset: -5, fill: '#71717a', fontSize: 10 }}
                        />
                        <YAxis 
                          stroke="#71717a" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(val) => val.toFixed(1)}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #27272a', 
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}
                          itemStyle={{ color: '#10b981' }}
                          labelStyle={{ color: '#71717a', marginBottom: '4px' }}
                          formatter={(value: number) => [`${value.toFixed(2)}s`, 'Time']}
                          labelFormatter={(label) => `Solve #${label}`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="time" 
                          stroke="#10b981" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          animationDuration={1000}
                        />
                        {best && (
                          <ReferenceLine 
                            y={best / 1000} 
                            stroke="#ef4444" 
                            strokeDasharray="3 3" 
                            label={{ value: 'PB', position: 'right', fill: '#ef4444', fontSize: 10 }} 
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 mb-8">
                  <TrendingUp size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Complete at least 2 solves to see your progress chart.</p>
                </div>
              )}

              {/* Distribution Chart */}
              {distributionData.length > 0 && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <BarChart2 size={20} style={{ color: settings.accentColor }} />
                      Time Distribution
                    </h3>
                    <span className="text-xs text-zinc-500 uppercase tracking-widest">Count</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distributionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis 
                          dataKey="range" 
                          stroke="#71717a" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#71717a" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip 
                          cursor={{ fill: '#27272a', opacity: 0.4 }}
                          contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #27272a', 
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}
                          itemStyle={{ color: settings.accentColor }}
                          labelStyle={{ color: '#71717a', marginBottom: '4px' }}
                          formatter={(value: number) => [value, 'Solves']}
                        />
                        <Bar 
                          dataKey="count" 
                          fill={settings.accentColor} 
                          radius={[4, 4, 0, 0]} 
                          animationDuration={1000}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Solve Details Modal */}
      {selectedSolveId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
          onClick={() => setSelectedSolveId(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const solve = solves.find(s => s.id === selectedSolveId);
              if (!solve) return null;
              return (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-semibold">Solve Details</h3>
                    <button onClick={() => setSelectedSolveId(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                      <X size={24} />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Time</div>
                      <div className={`text-4xl font-mono font-bold ${solve.penalty === 'DNF' ? 'text-red-400' : ''}`} style={{ color: solve.penalty !== 'DNF' ? settings.accentColor : undefined }}>
                        {formatSolveTime(solve, settings.showThreeDecimalPlaces)}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-zinc-500 mb-2">Actions</div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => togglePenalty(solve.id, '+2')}
                          className={`px-4 py-1.5 rounded-xl font-mono text-sm font-bold transition-colors ${solve.penalty === '+2' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                        >
                          +2
                        </button>
                        <button 
                          onClick={() => { deleteSolve(solve.id); setSelectedSolveId(null); }}
                          className="px-4 py-1.5 rounded-xl bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-colors"
                          title="Delete Solve"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button 
                          onClick={() => togglePenalty(solve.id, 'DNF')}
                          className={`px-4 py-1.5 rounded-xl font-mono text-sm font-bold transition-colors ${solve.penalty === 'DNF' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                        >
                          DNF
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-sm text-zinc-500">Scramble</div>
                        <button 
                          onClick={() => handleCopy(solve.scramble)}
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {copiedScramble === solve.scramble ? <Check size={14} style={{ color: settings.accentColor }} /> : <Copy size={14} />}
                          {copiedScramble === solve.scramble ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="font-mono text-zinc-300 bg-zinc-950 p-4 rounded-xl border border-zinc-800/50 leading-relaxed">
                        {solve.scramble}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Date</div>
                      <div className="text-zinc-300">
                        {new Date(solve.date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Auth Button */}
      <button 
        onClick={() => user ? signOut(auth) : setIsAuthModalOpen(true)}
        className="fixed bottom-20 right-6 p-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-full text-zinc-400 hover:text-zinc-200 transition-colors z-30 shadow-lg backdrop-blur-sm"
        title={user ? "Sign Out" : "Sign In"}
      >
        {user ? <LogOut size={24} /> : <LogIn size={24} />}
      </button>

      {/* Settings Button */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        className="fixed bottom-6 right-6 p-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-full text-zinc-400 hover:text-zinc-200 transition-colors z-30 shadow-lg backdrop-blur-sm"
      >
        <Settings size={24} />
      </button>

      {/* Boo Overlay */}
      {showBooOverlay && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden bg-red-500/5">
          <div className="absolute inset-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div 
                key={i} 
                className="absolute text-3xl opacity-40 animate-bounce"
                style={{ 
                  left: `${10 + Math.random() * 80}%`, 
                  top: `${10 + Math.random() * 80}%`,
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              >
                👎
              </div>
            ))}
          </div>
          <div className="relative flex flex-col items-center gap-2">
            <div className="text-4xl font-bold text-red-500/40 select-none tracking-widest uppercase">
              Worst Time
            </div>
            <div className="text-2xl animate-pulse text-red-500/30">👎</div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
          onClick={() => setIsSettingsOpen(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6 shrink-0">
              <h3 className="text-xl font-semibold">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex gap-1 mb-6 bg-zinc-800/30 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setActiveSettingsTab('general')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeSettingsTab === 'general' ? 'text-zinc-100 shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                style={{ backgroundColor: activeSettingsTab === 'general' ? settings.accentColor : undefined }}
              >
                <Settings size={16} />
                <span className="hidden sm:inline">General</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('appearance')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeSettingsTab === 'appearance' ? 'text-zinc-100 shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                style={{ backgroundColor: activeSettingsTab === 'appearance' ? settings.accentColor : undefined }}
              >
                <Palette size={16} />
                <span className="hidden sm:inline">Style</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('timer')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeSettingsTab === 'timer' ? 'text-zinc-100 shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                style={{ backgroundColor: activeSettingsTab === 'timer' ? settings.accentColor : undefined }}
              >
                <Timer size={16} />
                <span className="hidden sm:inline">Timer</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('cubes')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeSettingsTab === 'cubes' ? 'text-zinc-100 shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                style={{ backgroundColor: activeSettingsTab === 'cubes' ? settings.accentColor : undefined }}
              >
                <Settings size={16} />
                <span className="hidden sm:inline">Cubes</span>
              </button>
            </div>
            
            <div className="space-y-6 overflow-y-auto pr-2 pb-6 custom-scrollbar touch-pan-y">
              {activeSettingsTab === 'general' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Event */}
                  <div>
                    <label className="block text-sm text-zinc-500 mb-2">Event</label>
                    <div className="relative group">
                      <button
                        onClick={() => setIsEventDropdownOpen(!isEventDropdownOpen)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3.5 pr-10 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 text-left transition-all duration-200 hover:bg-zinc-800/50 flex items-center justify-between"
                        style={{ 
                          '--tw-ring-color': settings.accentColor,
                        } as React.CSSProperties}
                      >
                        <span>{settings.event}</span>
                        <ChevronDown size={18} className={`text-zinc-500 group-hover:text-zinc-300 transition-all duration-200 ${isEventDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {isEventDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setIsEventDropdownOpen(false)}
                          />
                          <div className="absolute z-20 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto custom-scrollbar">
                            {(['2x2', '3x3', '4x4', '5x5', '6x6', '7x7', 'Pyraminx', 'Megaminx', 'Skewb', 'Square-1', 'Clock'] as const).map(e => (
                              <button
                                key={e}
                                onClick={() => {
                                  setSettings(prev => ({ ...prev, event: e }));
                                  setCurrentScramble(generateScramble(e));
                                  setIsEventDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-3 transition-colors ${
                                  settings.event === e 
                                    ? 'bg-zinc-800 text-zinc-100' 
                                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                                }`}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Input Type */}
                  <div>
                    <label className="block text-sm text-zinc-500 mb-2">Input Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['keyboard', 'manual', 'bluetooth', 'stackmat'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => {
                            if (settings.inputType === 'stackmat' && type !== 'stackmat' && stackmatRef.current) {
                              stackmatRef.current.stop();
                              stackmatRef.current.off();
                              setIsStackmatConnected(false);
                            }
                            setSettings(prev => ({ ...prev, inputType: type }));
                          }}
                          className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${settings.inputType === type ? 'border' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                          style={{ 
                            backgroundColor: settings.inputType === type ? `${settings.accentColor}33` : undefined,
                            color: settings.inputType === type ? settings.accentColor : undefined,
                            borderColor: settings.inputType === type ? `${settings.accentColor}80` : undefined
                          }}
                        >
                          {type === 'bluetooth' ? 'GAN Timer' : type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Inspection */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">WCA Inspection (15s)</label>
                      <p className="text-xs text-zinc-600">Follows WCA rules for +2 and DNF penalties</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, useInspection: !prev.useInspection }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.useInspection ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.useInspection ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.useInspection ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Hold to Start Time */}
                  <div>
                    <label className="block text-sm text-zinc-500 mb-2">Hold to Start Time</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([100, 300, 500] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setSettings(prev => ({ ...prev, holdToStartTime: t }))}
                          className={`py-2 rounded-lg text-sm font-medium transition-colors ${settings.holdToStartTime === t ? 'border' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                          style={{ 
                            backgroundColor: settings.holdToStartTime === t ? `${settings.accentColor}33` : undefined,
                            color: settings.holdToStartTime === t ? settings.accentColor : undefined,
                            borderColor: settings.holdToStartTime === t ? `${settings.accentColor}80` : undefined
                          }}
                        >
                          {t/1000}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-divide Manual Input */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Auto-divide Manual Input</label>
                      <p className="text-xs text-zinc-600">Enter digits without decimal (e.g., 1234 → 12.34)</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, autoDivideManualInput: !prev.autoDivideManualInput }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoDivideManualInput ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.autoDivideManualInput ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.autoDivideManualInput ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'appearance' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Theme Presets */}
                  <div>
                    <label className="block text-sm text-zinc-500 mb-2">Theme Presets</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'dark', name: 'Dark', bg: '#0a0a0a', text: '#ededed', accent: '#10b981' },
                        { id: 'light', name: 'Light', bg: '#fafafa', text: '#171717', accent: '#059669' },
                        { id: 'ocean', name: 'Ocean', bg: '#0f172a', text: '#f8fafc', accent: '#38bdf8' },
                        { id: 'forest', name: 'Forest', bg: '#1c2e26', text: '#d1fae5', accent: '#34d399' },
                        { id: 'rose', name: 'Rose', bg: '#3f1d24', text: '#ffe4e6', accent: '#fb7185' },
                        { id: 'ultraviolet', name: 'UV', bg: '#231b38', text: '#ede9fe', accent: '#a78bfa' },
                      ] as const).map(t => (
                        <button
                          key={t.id}
                          onClick={() => setSettings(prev => ({ 
                            ...prev, 
                            theme: t.id,
                            backgroundColor: t.bg,
                            textColor: t.text,
                            accentColor: t.accent,
                            timerColor: t.accent
                          }))}
                          className={`py-2 rounded-lg text-xs font-medium transition-all ${settings.theme === t.id ? 'ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--bg-color)]' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'}`}
                          style={{ backgroundColor: t.bg, color: t.text }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Colors */}
                  <div className="space-y-4 pt-2 border-t border-zinc-800/50">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1.5">Background Image</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setSettings(prev => ({ ...prev, backgroundImage: reader.result as string }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
                        />
                        {settings.backgroundImage && (
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex justify-between text-xs text-zinc-500">
                              <span>Darkness</span>
                              <span>{Math.round(settings.backgroundImageDarkness * 100)}%</span>
                            </div>
                            <input 
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={settings.backgroundImageDarkness}
                              onChange={(e) => setSettings(prev => ({ ...prev, backgroundImageDarkness: parseFloat(e.target.value) }))}
                              className="w-full accent-[var(--accent-color)]"
                            />
                            <button 
                              onClick={() => setSettings(prev => ({ ...prev, backgroundImage: null }))}
                              className="text-xs text-red-400 hover:text-red-300 self-start"
                            >
                              Remove Image
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1.5">Background</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={settings.backgroundColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, backgroundColor: e.target.value, theme: 'dark' }))}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">{settings.backgroundColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={settings.textColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, textColor: e.target.value, theme: 'dark' }))}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">{settings.textColor}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1.5">Timer Color</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={settings.timerColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, timerColor: e.target.value, theme: 'dark' }))}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">{settings.timerColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1.5">Accent Color</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={settings.accentColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, accentColor: e.target.value, theme: 'dark' }))}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">{settings.accentColor}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Font */}
                  <div>
                    <label className="block text-sm text-zinc-500 mb-2">Font Family</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['sans', 'mono', 'serif'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setSettings(prev => ({ ...prev, fontFamily: f }))}
                          className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${settings.fontFamily === f ? 'border' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50'}`}
                          style={{ 
                            backgroundColor: settings.fontFamily === f ? `${settings.accentColor}33` : undefined,
                            color: settings.fontFamily === f ? settings.accentColor : undefined,
                            borderColor: settings.fontFamily === f ? `${settings.accentColor}80` : undefined
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timer Size */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm text-zinc-500">Timer Size</label>
                      <span className="text-xs text-zinc-400 font-mono">{settings.timerSize}</span>
                    </div>
                    <input 
                      type="range" 
                      min="3" 
                      max="20" 
                      step="0.5"
                      value={settings.timerSize}
                      onChange={(e) => setSettings(prev => ({ ...prev, timerSize: parseFloat(e.target.value) }))}
                      className="w-full"
                      style={{ accentColor: settings.accentColor }}
                    />
                  </div>

                  {/* Scramble Size */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm text-zinc-500">Scramble Size</label>
                      <span className="text-xs text-zinc-400 font-mono">{settings.scrambleSize}</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      step="0.25"
                      value={settings.scrambleSize}
                      onChange={(e) => setSettings(prev => ({ ...prev, scrambleSize: parseFloat(e.target.value) }))}
                      className="w-full"
                      style={{ accentColor: settings.accentColor }}
                    />
                  </div>

                  {/* Auto-scale Scramble */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Auto-scale Long Scrambles</label>
                      <p className="text-xs text-zinc-600">Shrinks text for 7x7, Megaminx, etc.</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, autoScaleScramble: !prev.autoScaleScramble }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoScaleScramble ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.autoScaleScramble ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.autoScaleScramble ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'timer' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Hide Timer While Running */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Hide Timer While Running</label>
                      <p className="text-xs text-zinc-600">Shows "Running" instead of the time</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, hideTimerWhileRunning: !prev.hideTimerWhileRunning }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.hideTimerWhileRunning ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.hideTimerWhileRunning ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.hideTimerWhileRunning ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Show 3 Decimal Places */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Show 3 Decimal Places</label>
                      <p className="text-xs text-zinc-600">Displays milliseconds with 3 digits</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, showThreeDecimalPlaces: !prev.showThreeDecimalPlaces }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showThreeDecimalPlaces ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.showThreeDecimalPlaces ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.showThreeDecimalPlaces ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Show Confetti on PB */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Confetti on PB</label>
                      <p className="text-xs text-zinc-600">Celebrates new personal bests with confetti</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, showConfettiOnPB: !prev.showConfettiOnPB }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showConfettiOnPB ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.showConfettiOnPB ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.showConfettiOnPB ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Boo on Worst Time */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm text-zinc-500">Boo on Worst Time</label>
                      <p className="text-xs text-zinc-600">Falling dislikes and sound for your worst session time</p>
                    </div>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, showBooOnWorstTime: !prev.showBooOnWorstTime }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showBooOnWorstTime ? '' : 'bg-zinc-700'}`}
                      style={{ backgroundColor: settings.showBooOnWorstTime ? settings.accentColor : undefined }}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.showBooOnWorstTime ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Scramble Visualization */}
                  {settings.event === '3x3' && (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-zinc-500">Show Scramble Visualization (White Face)</label>
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, showScrambleVisualization: !prev.showScrambleVisualization }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showScrambleVisualization ? '' : 'bg-zinc-700'}`}
                          style={{ backgroundColor: settings.showScrambleVisualization ? settings.accentColor : undefined }}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${settings.showScrambleVisualization ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {/* Scramble Visualization Size */}
                      {settings.showScrambleVisualization && (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm text-zinc-500">Visualization Size</label>
                            <span className="text-xs text-zinc-400 font-mono">{settings.scrambleVisualizationSize || 2}</span>
                          </div>
                          <input 
                            type="range" 
                            min="1" 
                            max="5" 
                            step="0.25"
                            value={settings.scrambleVisualizationSize || 2}
                            onChange={(e) => setSettings(prev => ({ ...prev, scrambleVisualizationSize: parseFloat(e.target.value) }))}
                            className="w-full"
                            style={{ accentColor: settings.accentColor }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeSettingsTab === 'cubes' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="space-y-4">
                    <label className="block text-sm text-zinc-500">Your Cubes</label>
                    <div className="space-y-2">
                      {cubes.map(cube => (
                        <div key={cube.id} className="flex items-center gap-2 bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
                          <button 
                            onClick={() => setCurrentCubeId(cube.id)}
                            className={`flex-1 text-left ${currentCubeId === cube.id ? 'text-zinc-100 font-bold' : 'text-zinc-400'}`}
                          >
                            {cube.name}
                          </button>
                          {cubes.length > 1 && (
                            <button onClick={() => deleteCube(cube.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCubeName}
                        onChange={(e) => setNewCubeName(e.target.value)}
                        placeholder="New cube model..."
                        className="flex-1 px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none"
                      />
                      <button 
                        onClick={() => addCube(newCubeName)}
                        className="px-4 py-2 rounded-xl text-black font-bold"
                        style={{ backgroundColor: settings.accentColor }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Average Solves Modal */}
      {selectedAverageSolves && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
          onClick={() => setSelectedAverageSolves(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-semibold">{selectedAverageSolves.title} Solves</h3>
              <button onClick={() => setSelectedAverageSolves(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {selectedAverageSolves.solves.map((solve, index) => (
                <div key={solve.id} className="bg-zinc-800/50 p-3 rounded-xl flex flex-col gap-1">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-zinc-400 font-mono text-sm">{index + 1}.</span>
                    <span className="text-zinc-100 font-mono">{formatSolveTime(solve, settings.showThreeDecimalPlaces)}</span>
                  </div>
                  <span className="text-zinc-600 font-mono text-xs break-all">{solve.scramble}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sessions Modal */}
      {isSessionModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
          onClick={() => setIsSessionModalOpen(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-semibold">Manage Sessions</h3>
              <button onClick={() => setIsSessionModalOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto mb-6 pr-2 custom-scrollbar">
              {sessions.map(session => (
                <div 
                  key={session.id} 
                  className={`flex flex-col p-3 rounded-xl border transition-colors ${currentSessionId === session.id ? '' : 'bg-zinc-800/30 border-zinc-800 hover:bg-zinc-800/50'}`}
                  style={currentSessionId === session.id ? { backgroundColor: 'var(--accent-color-alpha)', borderColor: 'var(--accent-color-alpha)' } : undefined}
                >
                  <div className="flex items-center justify-between">
                    {editingSessionId === session.id ? (
                      <input
                        type="text"
                        value={editingSessionName}
                        onChange={(e) => setEditingSessionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameSession(session.id, editingSessionName);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        onBlur={() => renameSession(session.id, editingSessionName)}
                        autoFocus
                        className="flex-1 px-2 py-1 mr-4 bg-zinc-950 border border-zinc-700 rounded-lg text-sm focus:outline-none"
                        style={{ borderColor: editingSessionId === session.id ? settings.accentColor : undefined }}
                      />
                    ) : (
                      <button 
                        onClick={() => { setCurrentSessionId(session.id); setIsSessionModalOpen(false); }}
                        className="flex-1 text-left font-medium truncate mr-4"
                      >
                        {session.name}
                      </button>
                    )}
                    
                    <div className="flex items-center gap-1">
                      {deletingSessionId === session.id ? (
                        <>
                          <span className="text-xs text-red-400 font-medium mr-1">Delete?</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                            className="p-1.5 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
                            title="Confirm Delete"
                          >
                            <Check size={16} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSessionId(null);
                            }}
                            className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (editingSessionId === session.id) {
                                renameSession(session.id, editingSessionName);
                              } else {
                                setEditingSessionId(session.id);
                                setEditingSessionName(session.name);
                                setDeletingSessionId(null);
                              }
                            }}
                            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                            title={editingSessionId === session.id ? "Save Name" : "Rename Session"}
                          >
                            {editingSessionId === session.id ? <Check size={16} style={{ color: settings.accentColor }} /> : <Settings size={16} />}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSessionId(session.id);
                              setEditingSessionId(null);
                            }}
                            className="p-2 text-red-500/70 hover:text-red-500 transition-colors"
                            title="Remove Session"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="New session name..."
                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none transition-colors"
                style={{ borderColor: newSessionName ? settings.accentColor : undefined }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSession(newSessionName);
                }}
              />
              <button 
                disabled={!newSessionName.trim()}
                onClick={() => addSession(newSessionName)}
                className="w-full py-3 rounded-xl text-black font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: settings.accentColor }}
              >
                <Play size={18} className="rotate-90" />
                Add Session
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Auth Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                <User size={20} style={{ color: settings.accentColor }} />
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </h2>
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {authError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
                  {authError}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-500 mb-2">Email</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all"
                    style={{ '--tw-ring-color': settings.accentColor } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-2">Password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all"
                    style={{ '--tw-ring-color': settings.accentColor } as React.CSSProperties}
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  setAuthError('');
                  try {
                    if (authMode === 'login') {
                      await signInWithEmailAndPassword(auth, authEmail, authPassword);
                    } else {
                      await createUserWithEmailAndPassword(auth, authEmail, authPassword);
                    }
                    setIsAuthModalOpen(false);
                  } catch (error: any) {
                    setAuthError(error.message);
                  }
                }}
                className="w-full py-3 rounded-xl text-black font-bold transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: settings.accentColor }}
              >
                {authMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-zinc-900 text-zinc-500">Or continue with</span>
                </div>
              </div>

              <button
                onClick={async () => {
                  setAuthError('');
                  try {
                    await signInWithPopup(auth, googleProvider);
                    setIsAuthModalOpen(false);
                  } catch (error: any) {
                    setAuthError(error.message);
                  }
                }}
                className="w-full py-3 bg-white text-black rounded-xl font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>

              <div className="text-center text-sm text-zinc-500">
                {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-zinc-300 hover:text-white transition-colors"
                >
                  {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
      <span className="text-zinc-500 text-xs uppercase tracking-widest mb-2 font-medium">{label}</span>
      <span className="text-2xl md:text-3xl font-mono text-zinc-100">{value}</span>
    </div>
  );
}
