import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import AppPopup from '../components/AppPopup';

const PopupContext = createContext(undefined);

function normalizeAlertButtons(buttons) {
  if (!buttons || buttons.length === 0) return [{ text: 'OK' }];
  return buttons.map((b) => ({
    text: b.text,
    style: b.style || 'default',
    onPress: b.onPress,
  }));
}

export function PopupProvider({ children }) {
  const [config, setConfig] = useState(null);
  const promptSubmitRef = useRef(null);

  const dismiss = useCallback(() => {
    promptSubmitRef.current = null;
    setConfig(null);
  }, []);

  const showAlert = useCallback((title, message, buttons) => {
    let msg = typeof message === 'string' ? message : '';
    let btns = buttons;
    if (Array.isArray(message)) {
      btns = message;
      msg = '';
    }
    setConfig({
      kind: 'alert',
      title: title || '',
      message: msg,
      buttons: normalizeAlertButtons(btns),
    });
  }, []);

  const showPrompt = useCallback((title, message, onSubmit, options = {}) => {
    promptSubmitRef.current = onSubmit;
    setConfig({
      kind: 'prompt',
      title: title || '',
      message: typeof message === 'string' ? message : '',
      defaultValue: options.defaultValue || '',
      confirmText: options.confirmText || 'OK',
      confirmStyle: options.confirmStyle,
    });
  }, []);

  const handleAlertButton = useCallback(
    (btn) => {
      const fn = btn.onPress;
      dismiss();
      if (typeof fn === 'function') {
        setTimeout(() => {
          try {
            fn();
          } catch (e) {
            console.error(e);
          }
        }, 0);
      }
    },
    [dismiss],
  );

  const handlePromptConfirm = useCallback(
    (value) => {
      const fn = promptSubmitRef.current;
      promptSubmitRef.current = null;
      setConfig(null);
      if (typeof fn === 'function') {
        setTimeout(() => {
          try {
            fn(value);
          } catch (e) {
            console.error(e);
          }
        }, 0);
      }
    },
    [],
  );

  return (
    <PopupContext.Provider value={{ showAlert, showPrompt }}>
      {children}
      <AppPopup
        visible={!!config}
        config={config}
        onDismiss={dismiss}
        onAlertButton={handleAlertButton}
        onPromptConfirm={handlePromptConfirm}
      />
    </PopupContext.Provider>
  );
}

export function usePopup() {
  const ctx = useContext(PopupContext);
  if (!ctx) {
    throw new Error('usePopup must be used within PopupProvider');
  }
  return ctx;
}
