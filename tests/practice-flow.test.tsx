import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { PRACTICE_STORAGE_KEY } from '@/server/storage';

describe('browser critical path', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('entry → practice → choice → outcome → handoff → inheritance → continue, with persistence', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(await screen.findByText(/Practice: simulation/i)).toBeInTheDocument();
    expect(screen.getByText(/Ashen Chog/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Controller A/).length).toBeGreaterThan(0);
    expect(screen.getByText(/The Feared/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue the story' }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Decision 1 of 3 today/)).toBeInTheDocument();

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const enabled = radios.filter(r => !r.disabled);
    expect(enabled.length).toBeGreaterThan(0);
    await user.click(enabled[0]);
    await user.click(screen.getByRole('button', { name: /^Confirm:/ }));

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();
    expect(screen.getByText(/Receipt/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Simulate controller change/i }));
    expect(await screen.findByRole('heading', { name: /A feared name\. A fresh chapter\./ })).toBeInTheDocument();
    expect(screen.getAllByText(/Controller B/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Continue to today’s encounter/i }));
    expect(await screen.findByText(/Decision 2 of 3 today/)).toBeInTheDocument();
    expect(screen.getByText(/Controller B/)).toBeInTheDocument();

    const radios2 = screen.getAllByRole('radio') as HTMLInputElement[];
    const enabled2 = radios2.filter(r => !r.disabled);
    await user.click(enabled2[0]);
    await user.click(screen.getByRole('button', { name: /^Confirm:/ }));
    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open chronicle' }));
    expect(await screen.findByRole('heading', { name: 'Chronicle' })).toBeInTheDocument();
    expect(screen.getByText('Simulated controller')).toBeInTheDocument();

    const filter = screen.getByLabelText(/Show/);
    await user.selectOptions(filter, 'ownership');
    expect(screen.getByText(/Ownership observed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Kept the disputed cache/i)).not.toBeInTheDocument();

    await user.selectOptions(filter, 'all');

    const saved = localStorage.getItem(PRACTICE_STORAGE_KEY);
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).db.characters[0].trust).not.toBe(-35);
  });

  it('practice reset restores the seeded villain after a confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    await user.click(screen.getByRole('button', { name: 'Continue the story' }));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    await user.click(radios.filter(r => !r.disabled)[0]);
    await user.click(screen.getByRole('button', { name: /^Confirm:/ }));
    await screen.findByText(/^Saved\./);
    await user.click(screen.getByRole('button', { name: 'Open chronicle' }));

    await user.click(screen.getByRole('button', { name: 'Reset practice' }));
    await waitFor(() => expect(screen.getByText(/Practice reset/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Controller A/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 of 3 decisions left today/)).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)!);
    expect(stored.db.characters[0].trust).toBe(-35);
  });

  it('practice state survives a remount (refresh)', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    await user.click(screen.getByRole('button', { name: 'Continue the story' }));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    await user.click(radios.filter(r => !r.disabled)[0]);
    await user.click(screen.getByRole('button', { name: /^Confirm:/ }));
    await screen.findByText(/^Saved\./);
    first.unmount();

    render(<App />);
    expect(await screen.findByText(/2 of 3 decisions left today/)).toBeInTheDocument();
    expect(screen.getAllByText(/Controller A/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Practice: simulation/i)).toBeInTheDocument();
  });

  it('real token lookup fails closed without inventing chain data', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText('Chog token ID');
    await user.type(input, '1425');
    await user.click(screen.getByRole('button', { name: 'Open profile' }));
    expect(await screen.findByRole('heading', { name: 'The character journal.' })).toBeInTheDocument();
    expect(await screen.findByText(/Could not reach the Chog API/i)).toBeInTheDocument();
    expect(screen.getByText(/STORAGE_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.queryByText(/Current owner:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0x601634f3/i)).not.toBeInTheDocument();
  });
});
