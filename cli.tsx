  import { AskView } from '@/tui/components/AskView.tsx';
  import { IngestView } from '@/tui/components/IngestView.tsx';
  import { SearchView } from '@/tui/components/SearchView.tsx';
  import { render } from 'ink';

  // Argument parsing
  const args = process.argv.slice(2);
  const command = args[0];

  function usage() {
    process.stderr.write(
      [
        '',
        ' ERPNext Assistant',
        '',
        ' Usage:',
        ' erpnext ask "<question>" Ask a question about the documentation',
        ' erpnext search "<query>" Search the documentation',
        ' erpnext ingest [--verbose] Index the documentation',
        '',
      ].join('\n') + '\n',
    );
    process.exit(1);
  }

  if (!command || command === '--help' || command === '-h') {
    usage();
  }

  // Mount the right view
  let app: ReturnType<typeof render>;
  switch (command) {
    case 'ask': {
      const question = args.slice(1).join(' ').trim();
      if (!question) {
        process.stderr.write('\x1b[31mError:\x1b[0m Please provide a question.\n');
        process.exit(1);
      }
      app = render(
        <AskView
          question={question}
          onDone={() => {
            app.unmount();
          }}
        />,
      );
      break;
    }

    case 'search': {
      const query = args.slice(1).join(' ').trim();
      if (!query) {
        process.stderr.write('\x1b[31mError:\x1b[0m Please provide a search query.\n');
        process.exit(1);
      }
      app = render(
        <SearchView
          query={query}
          onDone={() => {
            app.unmount();
          }}
        />,
      );
      break;
    }
    case 'ingest': {
      const verbose = args.includes('--verbose') || args.includes('-v');
      app = render(
        <IngestView
          verbose={verbose}
          onDone={() => {
            app.unmount();
          }}
        />,
      );
      break;
    }
    default:
      usage();
  }
