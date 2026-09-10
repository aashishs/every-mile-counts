import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampMafHeartRate, mafBase, mafHeartRate, mafOffsetFromValue } from './maf.js';

describe('MAF heart rate', () => {
  it('allows up to +5 over 180 − age and keeps that bonus at the next birthday', () => {
    assert.equal(mafBase(40), 140);
    assert.equal(clampMafHeartRate(40, 145), 145);
    assert.equal(clampMafHeartRate(40, 150), 145);
    const offset = mafOffsetFromValue(40, 145);
    assert.equal(mafHeartRate(41, offset), 144);
  });
});
