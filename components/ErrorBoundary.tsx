import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../utils/logger';
import { DatabaseError } from './DatabaseError';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    logError(error, { componentStack: errorInfo.componentStack });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <DatabaseError error={this.state.error} />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;