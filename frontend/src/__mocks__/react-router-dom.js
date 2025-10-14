import React from 'react';

// Mock BrowserRouter
export const BrowserRouter = ({ children }) => <div>{children}</div>;

// Mock Link
export const Link = ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>;

// Mock Navigate
export const Navigate = ({ to }) => null;

// Mock useNavigate
export const useNavigate = () => jest.fn();

// Mock useParams
export const useParams = () => ({});

// Mock useLocation
export const useLocation = () => ({
  pathname: '/',
  search: '',
  hash: '',
  state: null,
});

// Mock useHistory (for compatibility)
export const useHistory = () => ({
  push: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
});

// Mock Routes and Route
export const Routes = ({ children }) => <div>{children}</div>;
export const Route = () => null;

export default {
  BrowserRouter,
  Link,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
  useHistory,
  Routes,
  Route,
};
