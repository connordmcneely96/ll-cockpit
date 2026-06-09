          {/* Quality tier toggle — routes to standard or premium model routing table */}
          <button
            onClick={() => setQualityTier(qualityTier === 'standard' ? 'premium' : 'standard')}
            disabled={isStreaming}
            title={qualityTier === 'premium'
              ? 'Premium tier active (GPT-4.1 / Opus 4.8) — click for Standard'
              : 'Standard tier active — click for Premium (GPT-4.1 / Opus 4.8)'}
            className={[
              'px-2.5 py-1 rounded-full font-mono text-[11px] font-semibold transition-all disabled:opacity-40 cursor-pointer select-none',
              qualityTier === 'premium'
                ? 'bg-amber-500/20 border border-amber-400/50 text-amber-400 hover:bg-amber-500/30'
                : 'bg-white/[0.06] border border-white/[0.18] text-white/70 hover:text-white hover:border-white/30',
            ].join(' ')}
          >
            {qualityTier === 'premium' ? '✦ PRO' : 'STD'}
          </button>
