import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSubmitStatus } from '../store/interactionSlice';

export default function Toast() {
  const dispatch = useDispatch();
  const { submitStatus, editingId } = useSelector(s => s.interaction);

  useEffect(() => {
    if (submitStatus) {
      const timer = setTimeout(() => dispatch(setSubmitStatus(null)), 3500);
      return () => clearTimeout(timer);
    }
  }, [submitStatus, dispatch]);

  if (!submitStatus) return null;

  return (
    <div className={`toast ${submitStatus}`}>
      {submitStatus === 'success' ? (
        <>✅ Interaction {editingId ? 'updated' : 'logged'} successfully!</>
      ) : (
        <>❌ Something went wrong. Please try again.</>
      )}
    </div>
  );
}
