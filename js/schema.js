/* Section schemas: drive both the editor forms and the defaults for new sections. */
(function (global) {
  const FONTS = [
    'Playfair Display', 'Cormorant Garamond', 'Lora', 'DM Serif Display',
    'Inter', 'Poppins', 'Montserrat', 'Work Sans', 'Oswald',
  ];

  const SCHEMA = {
    hero: {
      label: 'Hero', icon: '🏠', nav: false,
      fields: [
        { key: 'heading', type: 'text', label: 'Headline' },
        { key: 'subheading', type: 'textarea', label: 'Subheadline' },
        { key: 'image', type: 'image', label: 'Background image' },
        { key: 'ctaText', type: 'text', label: 'Button text' },
        { key: 'ctaTarget', type: 'select', label: 'Button links to', options: 'sections' },
        { key: 'layout', type: 'select', label: 'Layout', options: [['center', 'Centered'], ['left', 'Left aligned']] },
      ],
      defaults: () => ({
        heading: 'Welcome to our restaurant', subheading: 'Fresh ingredients. Honest cooking.',
        image: '', ctaText: 'View the menu', ctaTarget: '', layout: 'center',
      }),
    },
    about: {
      label: 'About', icon: '📖',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'text', type: 'textarea', label: 'Story (blank line = new paragraph)', rows: 6 },
        { key: 'image', type: 'image', label: 'Image' },
      ],
      defaults: () => ({ title: 'Our story', text: 'Tell guests who you are and what makes your food special.', image: '' }),
    },
    menu: {
      label: 'Menu', icon: '🍽️',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'intro', type: 'textarea', label: 'Intro' },
        {
          key: 'categories', type: 'list', label: 'Categories', itemName: 'Category', itemLabel: 'name',
          newItem: () => ({ name: 'New category', items: [] }),
          itemFields: [
            { key: 'name', type: 'text', label: 'Category name' },
            {
              key: 'items', type: 'list', label: 'Dishes', itemName: 'Dish', itemLabel: 'name',
              newItem: () => ({ name: 'New dish', desc: '', price: '', tag: '' }),
              itemFields: [
                { key: 'name', type: 'text', label: 'Name' },
                { key: 'desc', type: 'textarea', label: 'Description', rows: 2 },
                { key: 'price', type: 'text', label: 'Price (e.g. $12)' },
                { key: 'tag', type: 'text', label: 'Badge (e.g. Vegan, Spicy)' },
              ],
            },
          ],
        },
      ],
      defaults: () => ({
        title: 'Menu', intro: '',
        categories: [{ name: 'Starters', items: [{ name: 'House salad', desc: 'Seasonal greens, vinaigrette', price: '$9', tag: 'Vegan' }] }],
      }),
    },
    gallery: {
      label: 'Gallery', icon: '🖼️',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        {
          key: 'images', type: 'list', label: 'Photos', itemName: 'Photo', itemLabel: 'caption',
          newItem: () => ({ url: '', caption: '' }),
          itemFields: [{ key: 'url', type: 'image', label: 'Image' }, { key: 'caption', type: 'text', label: 'Caption' }],
        },
      ],
      defaults: () => ({ title: 'Gallery', images: [{ url: '', caption: 'Our dining room' }, { url: '', caption: 'Signature dish' }, { url: '', caption: 'The bar' }] }),
    },
    testimonials: {
      label: 'Reviews', icon: '⭐',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        {
          key: 'items', type: 'list', label: 'Reviews', itemName: 'Review', itemLabel: 'author',
          newItem: () => ({ quote: '', author: '' }),
          itemFields: [{ key: 'quote', type: 'textarea', label: 'Quote', rows: 3 }, { key: 'author', type: 'text', label: 'Author' }],
        },
      ],
      defaults: () => ({ title: 'What guests say', items: [{ quote: 'Absolutely delicious, we will be back!', author: 'A happy guest' }] }),
    },
    hours: {
      label: 'Hours', icon: '🕒',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        {
          key: 'rows', type: 'list', label: 'Opening hours', itemName: 'Row', itemLabel: 'day',
          newItem: () => ({ day: '', time: '' }),
          itemFields: [{ key: 'day', type: 'text', label: 'Day(s)' }, { key: 'time', type: 'text', label: 'Hours' }],
        },
        { key: 'note', type: 'text', label: 'Note' },
      ],
      defaults: () => ({ title: 'Opening hours', rows: [{ day: 'Mon – Fri', time: '11:00 – 22:00' }, { day: 'Sat – Sun', time: '10:00 – 23:00' }], note: '' }),
    },
    reservations: {
      label: 'Reservations', icon: '📅',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'text', type: 'textarea', label: 'Text', rows: 3 },
        { key: 'button', type: 'text', label: 'Button text' },
        { key: 'success', type: 'text', label: 'Confirmation message' },
      ],
      defaults: () => ({
        title: 'Reserve a table', text: 'Book online and we will confirm shortly.',
        button: 'Request reservation', success: 'Thank you! We will confirm your reservation shortly.',
      }),
    },
    contact: {
      label: 'Contact', icon: '📍',
      fields: [
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'address', type: 'textarea', label: 'Address', rows: 2 },
        { key: 'phone', type: 'text', label: 'Phone' },
        { key: 'email', type: 'text', label: 'Email' },
        {
          key: 'social', type: 'list', label: 'Social links', itemName: 'Link', itemLabel: 'label',
          newItem: () => ({ label: 'Instagram', url: 'https://' }),
          itemFields: [{ key: 'label', type: 'text', label: 'Label' }, { key: 'url', type: 'text', label: 'URL' }],
        },
      ],
      defaults: () => ({ title: 'Find us', address: '123 Main Street\nYour City', phone: '', email: '', social: [] }),
    },
  };

  global.WB = global.WB || {};
  global.WB.FONTS = FONTS;
  global.WB.SCHEMA = SCHEMA;
})(window);
