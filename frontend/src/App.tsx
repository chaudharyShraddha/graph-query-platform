/**
 * Main App component with routing
 */
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import Layout from './components/Layout/Layout';
import Toast from './components/Toast/Toast';
import './App.css';

import DatasetsPage from './pages/Datasets/DatasetsPage';
import DatasetCreatePage from './pages/Datasets/DatasetCreatePage';
import DatasetDetailsPage from './pages/Datasets/DatasetDetailsPage';
import NodeUploadPage from './pages/Datasets/NodeUploadPage';
import RelationshipUploadPage from './pages/Datasets/RelationshipUploadPage';
import QueriesPage from './pages/Queries/QueriesPage';

function App() {
  return (
    <Provider store={store}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/datasets" replace />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/datasets/create" element={<DatasetCreatePage />} />
            <Route path="/datasets/:id" element={<DatasetDetailsPage />} />
            <Route path="/datasets/:id/upload-nodes" element={<NodeUploadPage />} />
            <Route path="/datasets/:id/upload-relationships" element={<RelationshipUploadPage />} />
            <Route path="/queries" element={<QueriesPage />} />
          </Routes>
        </Layout>
        <Toast />
      </Router>
    </Provider>
  );
}

export default App;
