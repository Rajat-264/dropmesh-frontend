import React, { useState } from 'react';
import './navbar.css';

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-brand">DropMesh</div>
      <button
        className="navbar-toggle"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        <span className="navbar-toggle-icon"></span>
      </button>
      <ul className={`navbar-links${open ? ' open' : ''}`}>
        <li><a href="/">Home</a></li>
        <li><a href="/send">Send</a></li>
        <li><a href="/receive">Receive</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  );
};

export default Navbar;
