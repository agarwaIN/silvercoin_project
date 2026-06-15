import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';

export default function SessionGuard({ children }) {
  const { sessionMessage, clearSessionMessage } = useAuth();
  const { showAlert } = usePopup();

  useEffect(() => {
    if (!sessionMessage) return;
    showAlert('Signed out', sessionMessage, [
      { text: 'OK', onPress: () => clearSessionMessage() },
    ]);
  }, [sessionMessage, showAlert, clearSessionMessage]);

  return children;
}
