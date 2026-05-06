// Vercel Web Analytics Initialization
// This script sets up the analytics queue and loads the Vercel Analytics script
// Following the official Vercel Analytics Quickstart guide

(function() {
  'use strict';
  
  // Initialize the analytics queue function
  // This creates the window.va function that queues analytics calls
  // until the main analytics script loads
  window.va = window.va || function () { 
    (window.vaq = window.vaq || []).push(arguments); 
  };
})();
