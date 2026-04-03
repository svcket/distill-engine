import * as React from 'react';

interface DigestEmailProps {
  userName: string;
  insights: {
    title: string;
    type: string;
    url: string;
    date: string;
    summary?: string;
  }[];
}

export const DigestEmail: React.FC<Readonly<DigestEmailProps>> = ({
  userName,
  insights,
}) => (
  <div style={{
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    backgroundColor: '#09090b',
    color: '#fafafa',
    padding: '40px 20px',
    maxWidth: '600px',
    margin: '0 auto',
    borderRadius: '12px',
  }}>
    <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#10b981' }}>Distill Engine</h1>
    <p style={{ fontSize: '16px', color: '#a1a1aa', marginBottom: '32px' }}>
      Good morning, {userName}. Here are your latest insights from the last 24 hours.
    </p>

    <div style={{ borderTop: '1px solid #27272a', paddingTop: '32px' }}>
      {insights.map((insight, index) => (
        <div key={index} style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
             <span style={{ 
               backgroundColor: '#27272a', 
               color: '#10b981', 
               fontSize: '10px', 
               padding: '2px 8px', 
               borderRadius: '9999px',
               textTransform: 'uppercase',
               fontWeight: 'bold'
             }}>
               {insight.type}
             </span>
             <span style={{ fontSize: '12px', color: '#71717a' }}>{insight.date}</span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#fafafa' }}>{insight.title}</h2>
          {insight.summary && (
            <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: '1.6', marginBottom: '12px' }}>
              {insight.summary}
            </p>
          )}
          <a href={insight.url} style={{ 
            color: '#10b981', 
            textDecoration: 'none', 
            fontSize: '14px', 
            fontWeight: '600' 
          }}>
            View Full Analysis →
          </a>
        </div>
      ))}
    </div>

    <div style={{ 
      marginTop: '40px', 
      paddingTop: '24px', 
      borderTop: '1px solid #27272a',
      textAlign: 'center' as const,
      fontSize: '12px',
      color: '#71717a'
    }}>
      <p>This is an automated digest from your Distill Engine.</p>
      <p>
        <a href={`${process.env.NEXT_PUBLIC_APP_URL}/settings`} style={{ color: '#10b981', textDecoration: 'none' }}>
          Manage Preferences
        </a>
      </p>
    </div>
  </div>
);
