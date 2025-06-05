import Receive from './pages/Receive';
import React from 'react';
import Send from './pages/Send';
import './App.css';
import Navbar from './components/navbar/Navbar';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function App() {

  return (
    <Router>
      <Navbar />
        <Routes>
          <Route path="/" element={<Send />} />
          <Route path="/receive" element={<Receive />} />
        </Routes>
    </Router>
  )
}

export default App;
