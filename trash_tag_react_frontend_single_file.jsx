/*
TrashTag - Single-file React app (preview)

How to use:
1. Create a Vite React app: `npm create vite@latest trashtag -- --template react`
2. Install deps: `npm install firebase react-router-dom tailwindcss postcss autoprefixer`
3. Configure Tailwind per docs, or replace classes with your own CSS.
4. Copy this file to `src/App.jsx` and import it from `src/main.jsx` (example below).
5. Add your Firebase config in the `FIREBASE_CONFIG` object or move to a separate firebase.js.

Notes:
- This single-file app contains lightweight components and Firebase (v9 modular) usage.
- It's intentionally opinionated but easy to split into separate files later.
- Admin functionality is role-guarded by a `role` property on the user doc.
*/

import React, { useEffect, useState, createContext, useContext } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  updateDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore'
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage'

// ---------- FIREBASE CONFIG (replace with your config) ----------
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MSG_SENDER_ID",
  appId: "YOUR_APP_ID"
}

// ---------- INIT FIREBASE ----------
const app = initializeApp(FIREBASE_CONFIG)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

// ---------- CONTEXTS ----------
const AuthContext = createContext(null)

function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null) // user doc from firestore
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const docRef = doc(db, 'users', u.uid)
        const snap = await getDoc(docRef)
        if (snap.exists()) setProfile(snap.data())
        else {
          // create a minimal profile
          const profileData = { name: u.email.split('@')[0], email: u.email, points: 0, role: 'member' }
          await setDoc(docRef, profileData)
          setProfile(profileData)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const value = { user, profile, setProfile, loading }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------- HELPERS ----------
async function signUp(email, password, displayName, organizationName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  const uid = cred.user.uid
  const userDoc = {
    uid,
    name: displayName || email.split('@')[0],
    email,
    role: organizationName ? 'org' : 'member',
    points: 0,
    organizationId: organizationName ? `org_${uid}` : null
  }
  await setDoc(doc(db, 'users', uid), userDoc)
  if (organizationName) {
    await setDoc(doc(db, 'organizations', userDoc.organizationId), {
      id: userDoc.organizationId,
      name: organizationName,
      members: [uid],
      totalPoints: 0
    })
  }
  return userDoc
}

async function logIn(email, password) {
  const resp = await signInWithEmailAndPassword(auth, email, password)
  return resp.user
}

async function logOut() {
  await signOut(auth)
}

// ---------- COMPONENTS ----------
function Navbar() {
  const { user, profile } = useAuth()
  return (
    <nav className="p-4 bg-gray-800 text-white flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link to="/" className="font-bold text-lg">TrashTag</Link>
        <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
        {profile?.role === 'org' && <Link to="/admin" className="hover:underline">Admin</Link>}
        <Link to="/cleanup" className="hover:underline">Log Cleanup</Link>
      </div>
      <div>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm">{profile?.name || user.email}</span>
            <AuthButtons />
          </div>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className="bg-white text-black px-3 py-1 rounded">Log in</Link>
            <Link to="/signup" className="border border-white px-3 py-1 rounded">Sign up</Link>
          </div>
        )}
      </div>
    </nav>
  )
}

function AuthButtons() {
  const navigate = useNavigate()
  return (
    <>
      <button className="bg-red-500 px-3 py-1 rounded" onClick={async () => { await logOut(); navigate('/') }}>Log out</button>
    </>
  )
}

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">TrashTag — track cleanups & reward communities</h1>
      <p className="mt-4">Organizations can create challenges, members log cleanups with photos, and everyone earns points. Use it to run community cleanups, motivate volunteers, and show impact.</p>
      <div className="mt-6 flex gap-4">
        <Link to="/signup" className="px-4 py-2 bg-green-600 text-white rounded">Get Started</Link>
        <Link to="/leaderboard" className="px-4 py-2 border rounded">See Leaderboard</Link>
      </div>
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    try {
      await logIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h2 className="text-2xl mb-4">Log in</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        {error && <div className="text-red-600">{error}</div>}
        <button className="bg-blue-600 text-white px-4 py-2 rounded">Log in</button>
      </form>
    </div>
  )
}

function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    try {
      await signUp(email, password, name, orgName || null)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h2 className="text-2xl mb-4">Sign up</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="(Optional) Organization name — create org account" />
        {error && <div className="text-red-600">{error}</div>}
        <button className="bg-green-600 text-white px-4 py-2 rounded">Create account</button>
      </form>
    </div>
  )
}

function Dashboard() {
  const { user, profile, setProfile } = useAuth()
  const [recent, setRecent] = useState([])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'cleanups'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'), limit(10))
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRecent(data)
    })
    return () => unsub()
  }, [user])

  if (!user) return <Navigate to="/login" />

  return (
    <div className="p-6">
      <h2 className="text-2xl">Dashboard</h2>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded">
          <h3 className="font-semibold">Your points</h3>
          <div className="text-3xl">{profile?.points ?? 0}</div>
        </div>
        <div className="p-4 border rounded md:col-span-2">
          <h3 className="font-semibold">Recent cleanups</h3>
          <ul>
            {recent.map(r => (
              <li key={r.id} className="py-2 border-b">{r.description} — {new Date(r.timestamp?.toDate?.() || r.timestamp).toLocaleString()}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6">
        <Link to="/cleanup" className="px-4 py-2 bg-blue-600 text-white rounded">Log a cleanup</Link>
      </div>
    </div>
  )
}

function Leaderboard() {
  const [users, setUsers] = useState([])
  const [orgs, setOrgs] = useState([])

  useEffect(() => {
    async function load() {
      const q = query(collection(db, 'users'), orderBy('points', 'desc'), limit(10))
      const snap = await getDocs(q)
      setUsers(snap.docs.map(d => d.data()))

      const q2 = query(collection(db, 'organizations'), orderBy('totalPoints', 'desc'), limit(10))
      const snap2 = await getDocs(q2)
      setOrgs(snap2.docs.map(d => d.data()))
    }
    load()
  }, [])

  return (
    <div className="p-6">
      <h2 className="text-2xl">Leaderboard</h2>
      <div className="grid md:grid-cols-2 gap-6 mt-4">
        <div className="border p-4 rounded">
          <h3 className="font-semibold">Top users</h3>
          <ol className="mt-2">
            {users.map((u, i) => (
              <li key={u.uid} className="py-2 flex justify-between"><span>{i+1}. {u.name}</span><span>{u.points} pts</span></li>
            ))}
          </ol>
        </div>
        <div className="border p-4 rounded">
          <h3 className="font-semibold">Top organizations</h3>
          <ol className="mt-2">
            {orgs.map((o, i) => (
              <li key={o.id} className="py-2 flex justify-between"><span>{i+1}. {o.name}</span><span>{o.totalPoints} pts</span></li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Admin() {
  const { user, profile } = useAuth()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [reward, setReward] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [message, setMessage] = useState(null)

  if (!user) return <Navigate to="/login" />
  if (profile?.role !== 'org') return <div className="p-6">Only organization accounts can access this page.</div>

  async function createChallenge(e) {
    e.preventDefault()
    const docRef = await addDoc(collection(db, 'challenges'), {
      orgId: profile.organizationId,
      title,
      description: desc,
      reward,
      startDate: new Date(start),
      endDate: new Date(end),
      participants: [],
      createdAt: serverTimestamp()
    })
    setMessage('Challenge created!')
    setTitle(''); setDesc(''); setReward(''); setStart(''); setEnd('')
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl">Admin — Create Challenge</h2>
      <form onSubmit={createChallenge} className="flex flex-col gap-3 mt-4">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" />
        <input value={reward} onChange={e => setReward(e.target.value)} placeholder="Reward" />
        <div className="flex gap-2">
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <button className="bg-purple-600 text-white px-4 py-2 rounded">Create</button>
        {message && <div className="text-green-600">{message}</div>}
      </form>
    </div>
  )
}

function CleanupForm() {
  const { user, profile, setProfile } = useAuth()
  const [desc, setDesc] = useState('')
  const [location, setLocation] = useState('')
  const [file, setFile] = useState(null)
  const [points, setPoints] = useState(10)
  const [message, setMessage] = useState(null)

  if (!user) return <Navigate to="/login" />

  async function submit(e) {
    e.preventDefault()
    let photoUrl = null
    if (file) {
      const storageRef = sref(storage, `cleanups/${user.uid}/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      photoUrl = await getDownloadURL(storageRef)
    }
    const data = {
      userId: user.uid,
      organizationId: profile?.organizationId || null,
      description: desc,
      location,
      photoUrl,
      pointsEarned: points,
      timestamp: serverTimestamp()
    }
    await addDoc(collection(db, 'cleanups'), data)

    // update user points
    const userRef = doc(db, 'users', user.uid)
    await updateDoc(userRef, { points: (profile?.points || 0) + points })

    // update org points
    if (profile?.organizationId) {
      const orgRef = doc(db, 'organizations', profile.organizationId)
      const orgSnap = await getDoc(orgRef)
      const cur = orgSnap.exists() ? orgSnap.data().totalPoints || 0 : 0
      await updateDoc(orgRef, { totalPoints: cur + points })
    }

    // refresh local profile
    const userSnap = await getDoc(userRef)
    setProfile(userSnap.data())

    setMessage('Cleanup logged — thanks!')
    setDesc(''); setLocation(''); setFile(null); setPoints(10)
  }

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-2xl">Log a cleanup</h2>
      <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
        <textarea placeholder="What did you clean?" value={desc} onChange={e => setDesc(e.target.value)} />
        <input placeholder="Location (address or park)" value={location} onChange={e => setLocation(e.target.value)} />
        <input type="number" value={points} onChange={e => setPoints(Number(e.target.value))} min={1} />
        <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">Submit cleanup</button>
        {message && <div className="text-green-600">{message}</div>}
      </form>
    </div>
  )
}

// ---------- APP ----------
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/cleanup" element={<CleanupForm />} />
            <Route path="*" element={<div className="p-6">Page not found</div>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

/*
Example src/main.jsx to mount this App:

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css' // include tailwind

createRoot(document.getElementById('root')).render(<App />)

*/
