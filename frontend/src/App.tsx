/**
 * Main App component with routing
 */
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import Layout from './components/Layout/Layout';
import Toast from './components/Toast/Toast';
import './App.css';

import DatasetsPage from './pages/Datasets/DatasetsPage';

// Placeholder pages - will be implemented later
const Dashboard = () => <div className="page">Dashboard Page</div>;
const Queries = () => <div className="page">Queries Page</div>;
const Schema = () => <div className="page">Schema Page</div>;

function App() {
  return (
    <Provider store={store}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/queries" element={<Queries />} />
            <Route path="/schema" element={<Schema />} />
          </Routes>
        </Layout>
        <Toast />
      </Router>
    </Provider>
  );
}

export default App;
