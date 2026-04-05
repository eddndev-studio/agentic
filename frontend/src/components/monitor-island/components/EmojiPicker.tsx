import React, { useState, useMemo } from 'react';
import { useMonitor } from '../MonitorProvider';

const EMOJI_TABS = [
    { id: 'smileys', icon: '😀', emojis: '😀😁😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬🤥🫠😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖' },
    { id: 'gestures', icon: '👋', emojis: '👋🤚🖐️✋🖖🫱🫲🫳🫴👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄' },
    { id: 'hearts', icon: '❤️', emojis: '❤️🧡💛💚💙💜🖤🤍🤎💔❤️‍🔥❤️‍🩹❣️💕💞💓💗💖💘💝💟🫶' },
    { id: 'animals', icon: '🐶', emojis: '🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷️🕸️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🪸🐡🐠🐟🐬🐳🐋🦈🦭🐊🐅🐆🦓🦍🦧🦣🐘🦛🦏🐪🐫🦒🦘🦬🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐕‍🦺🐈🐈‍⬛🪶🐓🦃🦤🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦫🦦🦥🐁🐀🐿️🦔🐾🐉🐲🌵🎄🌲🌳🌴🪵🌱🌿☘️🍀🎍🪴🎋🍃🍂🍁🍄🐚🪨🌾💐🌷🌹🥀🪻🌺🌸🌼🌻' },
    { id: 'food', icon: '🍕', emojis: '🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🫐🥝🍅🫒🥥🥑🍆🥔🥕🌽🌶️🫑🥒🥬🥦🧄🧅🍄🥜🫘🌰🍞🥐🥖🫓🥨🥯🥞🧇🧀🍖🍗🥩🥓🍔🍟🍕🌭🥪🌮🌯🫔🥙🧆🥚🍳🥘🍲🫕🥣🥗🍿🧈🧂🥫🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🍤🍥🥮🍡🥟🥠🥡🦀🦞🦐🦑🦪🍦🍧🍨🍩🍪🎂🍰🧁🥧🍫🍬🍭🍮🍯🍼🥛☕🫖🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃🫗🥤🧋🧃🧉🧊🥢🍽️🍴🥄' },
    { id: 'objects', icon: '⚽', emojis: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏋️🤸🤺⛹️🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🏵️🎗️🎫🎟️🎪🤹🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩' },
    { id: 'symbols', icon: '✅', emojis: '✅❌❓❗💯🔴🟠🟡🟢🔵🟣⚫⚪🟤🔺🔻🔸🔹🔶🔷💠🔘🔲🔳⬛⬜��◽▪️▫️��🚩🎌🏴🏳️🏳️‍🌈🏳️‍⚧️' },
] as const;

export function EmojiPicker() {
    const { state, dispatch, messageInputRef } = useMonitor();
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('smileys');

    const emojiList = useMemo(() => {
        if (search) {
            // Show all emojis when searching
            return [...EMOJI_TABS.map(t => t.emojis).join('')];
        }
        const tab = EMOJI_TABS.find(t => t.id === activeTab);
        return tab ? [...tab.emojis] : [];
    }, [search, activeTab]);

    if (!state.showEmojiPicker) return null;

    return (
        <div className="bg-wa-bg-deep border-t border-wa-border flex-shrink-0">
            {/* Search + tabs */}
            <div className="px-2 sm:px-3 pt-2 pb-1 flex items-center gap-2">
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar emoji..."
                    className="flex-1 bg-wa-bg-hover text-wa-text-primary text-xs py-1.5 px-3 rounded-full focus:outline-none placeholder-wa-text-secondary"
                />
            </div>
            {!search && (
                <div className="flex gap-0.5 px-2 sm:px-3 pb-1 overflow-x-auto">
                    {EMOJI_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-2 py-1 text-base rounded transition-colors flex-shrink-0 ${
                                activeTab === tab.id ? 'bg-wa-bg-hover' : 'hover:bg-wa-bg-hover/50'
                            }`}
                        >
                            {tab.icon}
                        </button>
                    ))}
                </div>
            )}
            {/* Grid */}
            <div className="grid grid-cols-7 sm:grid-cols-9 gap-0.5 px-2 sm:px-3 pb-2 max-h-44 overflow-y-auto">
                {emojiList.map((emoji, i) => (
                    <button
                        key={`${emoji}-${i}`}
                        onClick={() => {
                            dispatch({ type: 'SET_FIELD', field: 'messageInput', value: state.messageInput + emoji });
                            messageInputRef.current?.focus();
                        }}
                        className="w-9 h-9 flex items-center justify-center text-xl hover:bg-wa-bg-hover rounded transition-colors"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
}
