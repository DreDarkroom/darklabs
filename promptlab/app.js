import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [experiments, setExperiments] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'editor'
  const [currentExperimentId, setCurrentExperimentId] = useState(null);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('promptlab_experiments');
    if (saved) {
      try {
        setExperiments(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse experiments", e);
      }
    }
  }, []);

  // Save to local storage whenever experiments change
  useEffect(() => {
    localStorage.setItem('promptlab_experiments', JSON.stringify(experiments));
  }, [experiments]);

  const createExperiment = () => {
    const newExp = {
      id: Date.now().toString(),
      name: 'New Experiment',
      promptA: '',
      promptB: '',
      testCases: [{ id: 'tc1', text: '' }],
      criteria: [
        { id: 'c1', name: 'Accuracy', weight: 5 },
        { id: 'c2', name: 'Clarity', weight: 3 }
      ],
      scores: {
        A: {}, // { criteriaId: score_0_to_10 }
        B: {}
      }
    };
    setExperiments([...experiments, newExp]);
    setCurrentExperimentId(newExp.id);
    setCurrentView('editor');
  };

  const deleteExperiment = (id) => {
    setExperiments(experiments.filter(e => e.id !== id));
  };

  const updateExperiment = (updatedExp) => {
    setExperiments(experiments.map(e => e.id === updatedExp.id ? updatedExp : e));
  };

  // Helper for scoring math
  const calculateScore = (scoresObj, criteriaArray) => {
    let totalWeight = 0;
    let earned = 0;

    criteriaArray.forEach(c => {
      const w = Number(c.weight) || 0;
      totalWeight += w;
      const score = Number(scoresObj[c.id]) || 0;
      earned += (score * w);
    });

    if (totalWeight === 0) return 0;
    // Normalize to a 0-10 scale based on weighted average
    return (earned / (totalWeight * 10)) * 10;
  };

  // Hidden test function triggered from console
  window.runScoringTests = () => {
     console.log("--- RUNNING SCORING TESTS ---");
     const criteria = [ {id: 'c1', weight: 5}, {id: 'c2', weight: 5} ];

     // 1. Equal scores
     let sA = calculateScore({c1: 10, c2: 10}, criteria);
     let sB = calculateScore({c1: 10, c2: 10}, criteria);
     console.assert(sA === 10 && sB === 10, "Test 1 Failed: Equal max scores");

     // 2. A wins
     sA = calculateScore({c1: 8, c2: 8}, criteria);
     sB = calculateScore({c1: 5, c2: 5}, criteria);
     console.assert(sA > sB, "Test 2 Failed: A should win");

     // 3. Weighted criteria
     const criteriaWeighted = [ {id: 'c1', weight: 9}, {id: 'c2', weight: 1} ];
     sA = calculateScore({c1: 10, c2: 0}, criteriaWeighted); // 90 / 100 -> 9.0
     sB = calculateScore({c1: 0, c2: 10}, criteriaWeighted); // 10 / 100 -> 1.0
     console.assert(sA === 9 && sB === 1, "Test 3 Failed: Weighted scores incorrect");

     // 4. Missing/invalid scores
     sA = calculateScore({c1: null, c2: undefined}, criteriaWeighted);
     console.assert(sA === 0, "Test 4 Failed: Missing scores should calculate as 0");

     console.log("--- SCORING TESTS COMPLETE ---");
  };

  if (currentView === 'editor') {
    const exp = experiments.find(e => e.id === currentExperimentId);
    if (!exp) return <div>Experiment not found</div>;

    const handleNameChange = (e) => updateExperiment({ ...exp, name: e.target.value });
    const handlePromptAChange = (e) => updateExperiment({ ...exp, promptA: e.target.value });
    const handlePromptBChange = (e) => updateExperiment({ ...exp, promptB: e.target.value });

    // Test Cases
    const addTestCase = () => updateExperiment({ ...exp, testCases: [...exp.testCases, { id: Date.now().toString(), text: '' }] });
    const updateTestCase = (id, text) => updateExperiment({ ...exp, testCases: exp.testCases.map(tc => tc.id === id ? { ...tc, text } : tc) });
    const removeTestCase = (id) => updateExperiment({ ...exp, testCases: exp.testCases.filter(tc => tc.id !== id) });

    // Criteria
    const addCriteria = () => updateExperiment({ ...exp, criteria: [...exp.criteria, { id: Date.now().toString(), name: 'New Criteria', weight: 1 }] });
    const updateCriteriaName = (id, name) => updateExperiment({ ...exp, criteria: exp.criteria.map(c => c.id === id ? { ...c, name } : c) });
    const updateCriteriaWeight = (id, weight) => updateExperiment({ ...exp, criteria: exp.criteria.map(c => c.id === id ? { ...c, weight: parseInt(weight) || 1 } : c) });
    const removeCriteria = (id) => {
       const newCriteria = exp.criteria.filter(c => c.id !== id);
       const newScoresA = { ...exp.scores.A };
       const newScoresB = { ...exp.scores.B };
       delete newScoresA[id];
       delete newScoresB[id];
       updateExperiment({ ...exp, criteria: newCriteria, scores: { A: newScoresA, B: newScoresB } });
    };

    // Scores
    const updateScore = (prompt, criteriaId, value) => {
      // Allow empty string to reset, otherwise constrain 0-10
      let finalVal = value;
      if (value !== '') {
         finalVal = Math.min(10, Math.max(0, parseInt(value) || 0));
      }
      updateExperiment({
        ...exp,
        scores: {
          ...exp.scores,
          [prompt]: {
            ...exp.scores[prompt],
            [criteriaId]: finalVal
          }
        }
      });
    };

    const scoreA = calculateScore(exp.scores.A, exp.criteria);
    const scoreB = calculateScore(exp.scores.B, exp.criteria);

    let winnerText = "TIE";
    if (scoreA > scoreB) winnerText = "PROMPT A WINS";
    if (scoreB > scoreA) winnerText = "PROMPT B WINS";
    if (scoreA === 0 && scoreB === 0) winnerText = "AWAITING SCORES";

    return (
      <div className="max-w-6xl mx-auto pb-20">
        <div className="mb-6 flex justify-between items-center">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-red-soft hover:underline font-semibold tracking-wide text-sm"
          >
            &larr; BACK TO DASHBOARD
          </button>
        </div>

        <div className="mb-10">
           <input
             type="text"
             value={exp.name}
             onChange={handleNameChange}
             className="w-full bg-transparent text-4xl font-black text-white border-b-2 border-neutral-800 focus:border-red-soft outline-none pb-3 transition-colors"
             placeholder="Experiment Name"
           />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          {/* Prompt A */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
            <div className="bg-neutral-950 px-5 py-3 border-b border-neutral-800 flex justify-between items-center">
              <h3 className="font-bold text-neutral-300 uppercase tracking-wide text-sm">Prompt A (Baseline)</h3>
            </div>
            <textarea
              value={exp.promptA}
              onChange={handlePromptAChange}
              placeholder="Enter the baseline prompt..."
              className="w-full h-72 bg-transparent text-white p-5 outline-none resize-y font-mono text-sm leading-relaxed"
            />
          </div>

          {/* Prompt B */}
          <div className="bg-neutral-900 border border-red-soft/40 rounded-lg overflow-hidden flex flex-col shadow-[0_0_15px_rgba(105,0,0,0.15)]">
            <div className="bg-neutral-950 px-5 py-3 border-b border-red-soft/40 flex justify-between items-center">
              <h3 className="font-bold text-red-soft uppercase tracking-wide text-sm">Prompt B (Variant)</h3>
            </div>
            <textarea
              value={exp.promptB}
              onChange={handlePromptBChange}
              placeholder="Enter the improved prompt..."
              className="w-full h-72 bg-transparent text-white p-5 outline-none resize-y font-mono text-sm leading-relaxed"
            />
          </div>
        </div>

        {/* Test Cases */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-10">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-xl font-bold text-white uppercase tracking-wide">Test Cases</h3>
             <button onClick={addTestCase} className="text-sm bg-neutral-800 hover:bg-neutral-700 font-bold px-4 py-2 rounded text-white transition-colors">+ ADD CASE</button>
          </div>
          <div className="space-y-4">
            {exp.testCases.map((tc, index) => (
              <div key={tc.id} className="flex gap-3">
                <div className="bg-neutral-950 border border-neutral-800 px-4 py-3 rounded text-neutral-500 font-mono text-sm flex items-center justify-center font-bold">
                  #{index + 1}
                </div>
                <input
                  type="text"
                  value={tc.text}
                  onChange={(e) => updateTestCase(tc.id, e.target.value)}
                  placeholder="e.g. A client asking for a discount..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-4 py-3 text-white outline-none focus:border-neutral-600 transition-colors"
                />
                <button
                  onClick={() => removeTestCase(tc.id)}
                  className="text-neutral-500 hover:text-red-soft px-3 font-bold text-xl"
                  title="Remove test case"
                >
                  &times;
                </button>
              </div>
            ))}
            {exp.testCases.length === 0 && (
              <p className="text-neutral-500 text-sm italic py-2">No test cases defined. Add some scenarios to evaluate against.</p>
            )}
          </div>
        </div>

        {/* Evaluation and Scoring */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Criteria Editor */}
          <div className="lg:col-span-1 bg-neutral-900 border border-neutral-800 rounded-lg p-6">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-white uppercase tracking-wide">Criteria</h3>
               <button onClick={addCriteria} className="text-sm bg-neutral-800 hover:bg-neutral-700 font-bold px-3 py-1.5 rounded text-white transition-colors">+ ADD</button>
             </div>
             <div className="space-y-4">
               {exp.criteria.map(c => (
                 <div key={c.id} className="flex flex-col gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded">
                   <div className="flex justify-between items-center">
                     <input
                       type="text"
                       value={c.name}
                       onChange={(e) => updateCriteriaName(c.id, e.target.value)}
                       className="bg-transparent text-white font-bold outline-none w-3/4 border-b border-neutral-800 focus:border-red-soft pb-1 transition-colors"
                       placeholder="Criterion Name"
                     />
                     <button onClick={() => removeCriteria(c.id)} className="text-neutral-500 hover:text-red-soft font-bold text-lg">&times;</button>
                   </div>
                   <div className="flex items-center gap-3 text-sm text-neutral-400">
                     <label className="font-semibold uppercase tracking-wide text-xs">Weight (1-10):</label>
                     <input
                       type="number"
                       min="1" max="10"
                       value={c.weight}
                       onChange={(e) => updateCriteriaWeight(c.id, e.target.value)}
                       className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 w-16 text-white text-center outline-none focus:border-red-soft transition-colors"
                     />
                   </div>
                 </div>
               ))}
               {exp.criteria.length === 0 && (
                  <p className="text-neutral-500 text-sm italic py-2">No criteria defined.</p>
               )}
             </div>
          </div>

          {/* Scoring Grid */}
          <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-8 uppercase tracking-wide">Evaluation (out of 10)</h3>

            {exp.criteria.length > 0 ? (
              <div className="space-y-6">
                {exp.criteria.map(c => (
                  <div key={c.id} className="grid grid-cols-3 gap-4 items-center border-b border-neutral-800 pb-5 last:border-0">
                    <div className="font-bold text-neutral-300 text-lg">{c.name}</div>

                    {/* Prompt A Score */}
                    <div className="flex items-center gap-3 justify-center">
                      <span className="text-neutral-500 font-bold">A:</span>
                      <input
                        type="number"
                        min="0" max="10"
                        value={exp.scores.A[c.id] !== undefined ? exp.scores.A[c.id] : ''}
                        onChange={(e) => updateScore('A', c.id, e.target.value)}
                        placeholder="-"
                        className="bg-neutral-950 border border-neutral-700 rounded px-3 py-2.5 w-24 text-white text-center font-bold text-lg outline-none focus:border-neutral-500 transition-colors"
                      />
                    </div>

                    {/* Prompt B Score */}
                    <div className="flex items-center gap-3 justify-center">
                      <span className="text-red-soft font-bold">B:</span>
                      <input
                        type="number"
                        min="0" max="10"
                        value={exp.scores.B[c.id] !== undefined ? exp.scores.B[c.id] : ''}
                        onChange={(e) => updateScore('B', c.id, e.target.value)}
                        placeholder="-"
                        className="bg-neutral-950 border border-red-soft/50 rounded px-3 py-2.5 w-24 text-white text-center font-bold text-lg outline-none focus:border-red-soft transition-colors"
                      />
                    </div>
                  </div>
                ))}

                {/* Final Results */}
                <div className="mt-10 pt-8 border-t-2 border-neutral-800 grid grid-cols-3 gap-4 items-end">
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-widest mb-2 font-bold">Result</div>
                    <div className="text-2xl md:text-3xl font-black text-white">{winnerText}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-neutral-500 uppercase tracking-widest mb-2 font-bold">Overall A</div>
                    <div className="text-4xl font-mono text-neutral-300">{scoreA.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-red-soft uppercase tracking-widest mb-2 font-bold">Overall B</div>
                    <div className="text-4xl font-mono text-red-soft font-bold">{scoreB.toFixed(2)}</div>
                  </div>
                </div>

              </div>
            ) : (
              <p className="text-neutral-500 italic text-center py-10">Add criteria to start scoring.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 pt-6">
      <div className="mb-10 text-center md:text-left">
        <a href="../" className="text-red-soft hover:underline font-bold text-sm tracking-wide">&larr; DARKROOM LABS</a>
      </div>

      <header className="text-center mb-16">
        <h1 className="text-5xl font-black text-red-soft mb-4 tracking-tight">Prompt Lab</h1>
        <p className="text-neutral-400 font-bold tracking-widest text-sm uppercase">Experimental AI Workflows</p>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h2 className="text-2xl font-black text-white uppercase tracking-wide">Experiments</h2>
        <button
          onClick={createExperiment}
          className="bg-red hover:bg-red-soft text-white px-6 py-3 rounded font-bold transition-colors shadow-[0_0_15px_rgba(105,0,0,0.3)] hover:shadow-[0_0_25px_rgba(105,0,0,0.5)] tracking-wide"
        >
          + NEW EXPERIMENT
        </button>
      </div>

      {experiments.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 p-12 rounded-lg text-center">
          <p className="text-neutral-400 font-semibold mb-4 text-lg">No experiments found. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {experiments.map(exp => (
            <div key={exp.id} className="bg-neutral-900 border-2 border-neutral-800 hover:border-red-soft p-6 rounded-lg transition-all flex flex-col cursor-pointer group" onClick={() => { setCurrentExperimentId(exp.id); setCurrentView('editor'); }}>
              <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-red-soft transition-colors">{exp.name || 'Unnamed Experiment'}</h3>
              <p className="text-neutral-400 text-sm mb-6 font-semibold uppercase tracking-wide">
                {exp.criteria.length} criteria &bull; {exp.testCases.length} test cases
              </p>
              <div className="mt-auto flex justify-end">
                 <button
                   onClick={(e) => { e.stopPropagation(); deleteExperiment(exp.id); }}
                   className="text-neutral-600 hover:text-red-soft font-bold text-sm uppercase tracking-wide transition-colors"
                 >
                   Delete
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Engineering Educational Section */}
      <div className="mt-20 bg-neutral-900 border-l-4 border-red-soft p-8 rounded-r-lg shadow-lg">
        <h3 className="text-xl font-black text-white mb-4 uppercase tracking-wide">AI Engineering Principles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ul className="list-none space-y-4 text-neutral-300 font-medium">
            <li className="flex gap-3"><span className="text-red-soft font-bold">&rarr;</span> Prompts are artefacts that should be versioned.</li>
            <li className="flex gap-3"><span className="text-red-soft font-bold">&rarr;</span> Outputs must be evaluated against formalised criteria.</li>
            <li className="flex gap-3"><span className="text-red-soft font-bold">&rarr;</span> "Better prompt" should mean a measurable, mathematical improvement.</li>
            </ul>
            <ul className="list-none space-y-4 text-neutral-300 font-medium">
            <li className="flex gap-3"><span className="text-red-soft font-bold">&rarr;</span> AI systems require structured regression testing.</li>
            <li className="flex gap-3"><span className="text-red-soft font-bold">&rarr;</span> Developer tools should prioritise usability, contrast, and clarity over unnecessary decoration.</li>
            </ul>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
