import React from 'react';
import "./navbar.css";
import { Link } from "react-router-dom";
const Navbar = () => {
  return (
    <div className="navbar">
      <div className="logo">
        Dropmesh
      </div>
      <div className="nav-links">
        <Link to="/" style={{textDecoration:"none"}} className="link">Home/Send</Link>
        <Link to="/receive" style={{textDecoration:"none"}} className="link">Receive</Link> 
        <Link to="/about" style={{textDecoration:"none"}} className="link">About</Link>    
      </div>
    </div>
  )
}

export default Navbar;
