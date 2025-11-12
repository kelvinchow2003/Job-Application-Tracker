import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp, setLogLevel } from 'firebase/firestore';
import { Briefcase, Calendar, MessageSquare, Trash2, Edit, X, Plus, ExternalLink, FileText, CheckCircle } from 'lucide-react';

// Configuration based on Canvas globals
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-job-tracker-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Status definitions
const STATUS_OPTIONS = [
  { value: 'Applied', color: 'bg-blue-100 text-blue-800' },
  { value: 'Interviewing', color: 'bg-purple-100 text-purple-800' },
  { value: 'Offer', color: 'bg-green-100 text-green-800' },
  { value: 'Rejected', color: 'bg-red-100 text-red-800' },
  { value: 'Wishlist', color: 'bg-yellow-100 text-yellow-800' },
];

// Helper to safely get the status color class
const getStatusColor = (status) => {
  return STATUS_OPTIONS.find(opt => opt.value === status)?.color || 'bg-gray-100 text-gray-800';
};

// --- Firebase Initialization and Data Handling ---

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Updated initial state to include new fields
  const [newJob, setNewJob] = useState({
    company: '',
    title: '',
    status: 'Applied',
    appliedDate: new Date().toISOString().substring(0, 10), // YYYY-MM-DD
    notes: '',
    postingLink: '', // New field
    documentsUsed: '', // New field
  });

  // 1. Initialize Firebase and Auth
  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config is missing.");
      setLoading(false);
      return;
    }

    setLogLevel('Debug'); // Enable Firebase logging
    const app = initializeApp(firebaseConfig);
    const authInstance = getAuth(app);
    const dbInstance = getFirestore(app);

    setAuth(authInstance);
    setDb(dbInstance);

    // Sign in using custom token or anonymously
    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(authInstance, initialAuthToken);
        } else {
          await signInAnonymously(authInstance);
        }
      } catch (error) {
        console.error("Firebase Auth failed:", error);
      }
    };
    authenticate();

    // Set up auth state change listener to get the user ID
    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        // Fallback for unauthenticated state (shouldn't happen with anonymous sign-in)
        setUserId(crypto.randomUUID());
      }
      // Authentication is ready, data fetching can proceed
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time data subscription
  useEffect(() => {
    if (!db || !userId) {
      return;
    }

    const collectionPath = `artifacts/${appId}/users/${userId}/jobApplications`;
    const q = query(collection(db, collectionPath));

    // Listen for real-time updates
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore Timestamp to JS Date string if it exists
        appliedDate: doc.data().appliedDate?.toDate ? doc.data().appliedDate.toDate().toISOString().substring(0, 10) : doc.data().appliedDate,
      }));
      // Sort the jobs by applied date descending
      jobList.sort((a, b) => new Date(b.appliedDate) - new Date(a.appliedDate));
      setJobs(jobList);
      setLoading(false);
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId]);

  // --- CRUD Operations ---

  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!db || !userId) {
      console.error("Database or User ID not ready.");
      return;
    }

    const jobToAdd = {
      ...newJob,
      appliedDate: Timestamp.fromDate(new Date(newJob.appliedDate)),
      createdAt: Timestamp.now(),
    };

    try {
      const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/jobApplications`);
      await addDoc(collectionRef, jobToAdd);
      // Reset state to include new fields
      setNewJob({ 
        company: '', 
        title: '', 
        status: 'Applied', 
        appliedDate: new Date().toISOString().substring(0, 10), 
        notes: '',
        postingLink: '', 
        documentsUsed: '' 
      });
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding job:", error);
    }
  };

  const handleDeleteJob = async (id) => {
    if (!db || !userId) return;

    // Custom confirmation modal (replacing alert/confirm)
    if (!window.confirm("Are you sure you want to delete this job application?")) {
      return;
    }

    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/jobApplications`, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting job:", error);
    }
  };

  const handleUpdateStatus = async (jobId, newStatus) => {
    if (!db || !userId || !newStatus) return;

    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/jobApplications`, jobId);
      await updateDoc(docRef, { status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // --- UI Components ---

  const AddJobModal = () => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 transition-opacity duration-300">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl transform scale-100 transition-transform duration-300">
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Plus className="w-5 h-5 mr-2 text-indigo-600" /> Add New Application
          </h2>
          <button
            onClick={() => setShowAddModal(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleAddJob}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company and Title (unchanged) */}
            <div className="col-span-1">
              <label htmlFor="company" className="block text-sm font-medium text-gray-700">Company</label>
              <input
                id="company"
                type="text"
                value={newJob.company}
                onChange={(e) => setNewJob({ ...newJob, company: e.target.value })}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                placeholder="Google"
              />
            </div>
            <div className="col-span-1">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Job Title</label>
              <input
                id="title"
                type="text"
                value={newJob.title}
                onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                placeholder="Software Engineer"
              />
            </div>
            
            {/* Status and Date (unchanged) */}
            <div className="col-span-1">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
              <select
                id="status"
                value={newJob.status}
                onChange={(e) => setNewJob({ ...newJob, status: e.target.value })}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border appearance-none pr-8"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.value}</option>
                ))}
              </select>
            </div>
            <div className="col-span-1">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700">Date Applied</label>
              <input
                id="date"
                type="date"
                value={newJob.appliedDate}
                onChange={(e) => setNewJob({ ...newJob, appliedDate: e.target.value })}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
              />
            </div>
          </div>
          
          {/* New Fields: Link and Documents Used */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
              <label htmlFor="postingLink" className="block text-sm font-medium text-gray-700">Job Posting Link (URL)</label>
              <input
                id="postingLink"
                type="url"
                value={newJob.postingLink}
                onChange={(e) => setNewJob({ ...newJob, postingLink: e.target.value })}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                placeholder="https://example.com/job-post"
              />
            </div>
            <div className="col-span-1">
              <label htmlFor="documentsUsed" className="block text-sm font-medium text-gray-700">Documents Used (e.g., v3 Resume, AI Cover Letter)</label>
              <input
                id="documentsUsed"
                type="text"
                value={newJob.documentsUsed}
                onChange={(e) => setNewJob({ ...newJob, documentsUsed: e.target.value })}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                placeholder="SDE Resume v1.2, Custom CL"
              />
            </div>
          </div>

          {/* Notes (unchanged) */}
          <div className="mt-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
            <textarea
              id="notes"
              rows="3"
              value={newJob.notes}
              onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
              placeholder="Recruiter contacted me, next step is the technical screen..."
            />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-full shadow-md hover:bg-indigo-700 transition duration-150 ease-in-out transform hover:scale-[1.01]"
            >
              Save Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const JobCard = ({ job }) => {
    const statusColorClass = getStatusColor(job.status);
    const dateDisplay = job.appliedDate && job.appliedDate !== 'Invalid Date' ? new Date(job.appliedDate).toLocaleDateString() : 'N/A';

    return (
      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-5 border border-gray-100 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-extrabold text-gray-900 truncate">
                {job.company}
              </h3>
              <p className="text-indigo-600 text-sm font-medium flex items-center mt-0.5">
                <Briefcase className="w-4 h-4 mr-1" /> {job.title}
              </p>
            </div>
            <div className="ml-3">
              <select
                className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColorClass} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer appearance-none`}
                value={job.status}
                onChange={(e) => handleUpdateStatus(job.id, e.target.value)}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-white text-gray-800">
                    {opt.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-sm text-gray-600 space-y-2 mb-4">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <span className="font-medium">Applied:</span> {dateDisplay}
            </div>
            {job.documentsUsed && (
              <div className="flex items-start">
                <FileText className="w-4 h-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                <span className="font-medium">Docs:</span> <span className="ml-1 text-gray-700">{job.documentsUsed}</span>
              </div>
            )}
            {job.notes && (
              <div className="flex">
                <MessageSquare className="w-4 h-4 text-gray-400 mr-2 mt-1 flex-shrink-0" />
                <p className="text-sm italic text-gray-700 line-clamp-2">
                  {job.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer with Link and Delete */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
          {job.postingLink ? (
            <a
              href={job.postingLink.startsWith('http') ? job.postingLink : `https://${job.postingLink}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors hover:underline"
            >
              <ExternalLink className="w-4 h-4 mr-1" /> View Posting
            </a>
          ) : (
            <span className="text-xs text-gray-400">No link provided</span>
          )}

          <button
            onClick={() => handleDeleteJob(job.id)}
            className="flex items-center text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-indigo-600 font-semibold text-xl">Loading Application Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 p-4 bg-white rounded-xl shadow-md">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-indigo-700 flex items-center">
            <CheckCircle className="w-8 h-8 mr-3 text-indigo-500" />
            Job Application Tracker
          </h1>
          <p className="mt-1 text-gray-500 text-sm">
            Keep tabs on all your job hunting efforts. Data is saved in real-time.
          </p>
          <p className="mt-2 text-xs text-gray-400 break-all">
            <span className="font-bold text-gray-500">User ID:</span> {userId}
          </p>
        </header>

        {/* Main Content */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {jobs.length} Applications Tracked
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-full shadow-lg hover:bg-indigo-700 transition duration-150 ease-in-out transform hover:scale-[1.02]"
          >
            <Plus className="w-5 h-5 mr-2" /> Add New Job
          </button>
        </div>

        {/* Job List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.length > 0 ? (
            jobs.map(job => <JobCard key={job.id} job={job} />)
          ) : (
            <div className="md:col-span-2 lg:col-span-3 bg-white p-10 rounded-xl shadow-inner border-4 border-dashed border-gray-200 text-center">
              <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-xl font-semibold text-gray-600">No applications yet!</p>
              <p className="text-gray-500">Click "Add New Job" to start tracking your search.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Job Modal */}
      {showAddModal && <AddJobModal />}
    </div>
  );
};

export default App;